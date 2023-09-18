import Foundation
import CommonCrypto

private let TUTAO_CRYPT_BLOCK_SIZE = 16
private let MAC_DIGEST_LENGTH = Int(CC_SHA256_DIGEST_LENGTH)
private let MAC_IDENTIFIER: UInt8 = 0x01

struct SubKeys {
  let encryptionKey: Data
  let macKey: Data?
}

/// Encrypt the data with AES and return it
func aesEncrypt(data: Data, withKey key: Data, withIV iv: Data, withMAC: Bool) throws -> Data {
  let subKeys = try getSubKeys(withAESKey: key, withMAC: withMAC)
  let hmacOverhead = withMAC ? (MAC_DIGEST_LENGTH + 1) : 0
  
  // Allocate everything upfront
  var output: [UInt8] = []
  output.reserveCapacity(hmacOverhead + iv.count + data.count + TUTAO_CRYPT_BLOCK_SIZE)
  
  // We pass a single byte as an identifier for the MAC (it also makes the size uneven which we can check for trivially)
  if withMAC {
    output.append(MAC_IDENTIFIER);
  }
  
  // Convert to uint8 array so we can do slicing without further reallocations
  try aesEncryptData(data: [UInt8](data), withKey: subKeys.encryptionKey, withIV: iv, toOutput: &output)
  
  // Finally, append MAC
  if withMAC {
    let hmac = hmac256(withKey: subKeys.macKey!, forEncryptedData: output[1..<output.count])
    output.append(contentsOf: hmac)
  }
  
  return Data(output)
}

/// Decrypt the encrypted data without MAC.
///
/// ONLY VISIBLE FOR TESTING
func aes128DecryptWithoutMAC(fileData data: Data, withKey key: Data) throws -> Data {
  if data.count % 2 == 1 {
    throw TUTErrorFactory.createError(withDomain: TUT_CRYPTO_ERROR, message: "calling aes128DecryptWithoutMAC on data that no MAC")
  }
  
  if key.count != kCCKeySizeAES128 {
    throw TUTErrorFactory.createError(withDomain: TUT_CRYPTO_ERROR, message: "calling aes128DecryptWithoutMAC on non-128-bit key")
  }
  
  let dataArr = [UInt8](data)
  let encryptionKey = try deriveEncryptionKey(forData: dataArr, withKey: key)
  
  let ivOffset = 0
  let dataOffset = ivOffset + TUTAO_CRYPT_BLOCK_SIZE
  
  let iv = dataArr[ivOffset..<dataOffset]
  let data = dataArr[dataOffset...]
  
  return try aesDecrypt(data: data, withIV: Data(iv), withKey: encryptionKey, withPadding: true)
}

/// Decrypt the encrypted MAC'd data
func aesDecrypt(fileData data: Data, withKey key: Data) throws -> Data {
  if data.count % 2 != 1 || data[0] != MAC_IDENTIFIER {
    throw TUTErrorFactory.createError(withDomain: TUT_CRYPTO_ERROR, message: "calling aesDecrypt on data that has no MAC")
  }
  
  let dataArr = [UInt8](data)
  let encryptionKey = try deriveEncryptionKey(forData: dataArr, withKey: key)
  
  let ivOffset = 1
  let dataOffset = ivOffset + TUTAO_CRYPT_BLOCK_SIZE
  let macOffset = dataArr.count - MAC_DIGEST_LENGTH
  
  let iv = dataArr[ivOffset..<dataOffset]
  let data = dataArr[dataOffset..<macOffset]
  
  return try aesDecrypt(data: data, withIV: Data(iv), withKey: encryptionKey, withPadding: true)
}

/// Decrypt an encryption key
func aesDecrypt(encryptedKey: Data, withKey key: Data) throws -> Data {
  let data = [UInt8](encryptedKey)
  
  // We never use MAC or random IV with AES-128
  if key.count == kCCKeySizeAES128 {
    let iv = Data(repeating: 0x88, count: kCCKeySizeAES128)
    return try aesDecrypt(data: data[...], withIV: iv, withKey: key, withPadding: false)
  }
  
  let encryptionKey = try deriveEncryptionKey(forData: data, withKey: key)
  
  let useMAC = encryptedKey.count % 2 == 1
  let ivOffset = useMAC ? 1 : 0
  let dataOffset = ivOffset + TUTAO_CRYPT_BLOCK_SIZE
  let dataEnd = dataOffset - (useMAC ? MAC_DIGEST_LENGTH : 0)
  
  let encryptedData = data[dataOffset..<dataEnd]
  let iv = data[ivOffset..<dataOffset]
  
  return try aesDecrypt(data: encryptedData, withIV: Data(iv), withKey: encryptionKey, withPadding: false)
}

private func aesDecrypt(data: ArraySlice<UInt8>, withIV iv: Data, withKey key: Data, withPadding padding: Bool) throws -> Data {
  var output: [UInt8] = []
  output.reserveCapacity(data.count)
  
  try aesDoCrypt(operation: CCOperation(kCCDecrypt), withKey: key, withData: data, toOutput: &output, withIV: iv, withPadding: padding)
  
  return Data(output)
}

/// Decrypt a base64-encoded encrypted string
func aesDecrypt(base64String string: String, withKey key: Data) throws -> String {
  let decoded = TUTEncodingConverter.base64(toBytes: string)
  let decrypted = try aesDecrypt(fileData: decoded, withKey: key)
  return TUTEncodingConverter.bytes(toBase64: decrypted)
}

private func deriveEncryptionKey(forData data: [UInt8], withKey key: Data) throws -> Data {
  let hasMAC = data.count % 2 == 1
  
  if hasMAC {
    let subKeys = try getSubKeys(withAESKey: key, withMAC: hasMAC)
    try verifyMAC(forData: data, withMACKey: subKeys.macKey!)
    return subKeys.encryptionKey
  }
  
  return key
}

private func verifyMAC(forData data: [UInt8], withMACKey key: Data) throws {
  if data[0] != MAC_IDENTIFIER {
    throw TUTErrorFactory.createError(withDomain: TUT_CRYPTO_ERROR, message: "invalid MAC: first byte is not \(MAC_IDENTIFIER) but actually \(data[0])")
  }
  
  let macOffset = data.count - MAC_DIGEST_LENGTH
  let dataToCheck = data[1..<macOffset]
  
  let actual = hmac256(withKey: key, forEncryptedData: dataToCheck)
  let expected = data[macOffset..<data.count]
  if !expected.elementsEqual(actual) {
    throw TUTErrorFactory.createError(withDomain: TUT_CRYPTO_ERROR, message: "invalid MAC: checksum is wrong")
  }
}

private func aesEncryptData(data: [UInt8], withKey key: Data, withIV iv: Data, toOutput output: inout [UInt8]) throws {
  if iv.count != TUTAO_IV_BYTE_SIZE {
    throw TUTErrorFactory.createError(withDomain: TUT_CRYPTO_ERROR, message: "invalid IV length (expected \(TUTAO_IV_BYTE_SIZE), got \(iv.count) instead)")
  }
  output.append(contentsOf: iv);
  try aesDoCrypt(operation:CCOperation(kCCEncrypt), withKey: key, withData: data[...], toOutput: &output, withIV: iv, withPadding:true)
}

/// Execute a CryptoCommons operation on the whole data input
private func aesDoCrypt(operation: CCOperation, withKey key: Data, withData input: ArraySlice<UInt8>, toOutput output: inout [UInt8], withIV iv: Data, withPadding padding: Bool) throws {
  var cryptor: CCCryptorRef?
  let cryptorCreationResult = key.withUnsafeBytes{keyBytes in
    iv.withUnsafeBytes{ivBytes in
      CCCryptorCreate(operation,                    // operation
                      CCAlgorithm(kCCAlgorithmAES), // algorithm
                      padding ? CCOptions(kCCOptionPKCS7Padding) : 0,
                      keyBytes.baseAddress,         // key
                      keyBytes.count,               // keylength
                      ivBytes.baseAddress,          // IV
                      &cryptor)
    }
  }
  
  if cryptorCreationResult != kCCSuccess {
    throw TUTErrorFactory.createError(withDomain: TUT_CRYPTO_ERROR, message: "CCCryptorCreate returned \(cryptorCreationResult)")
  }
  
  defer { CCCryptorRelease(cryptor) }
  
  var currentOffset = input.startIndex
  var outputBufferLength = 0
  var outputBuffer = [UInt8](repeating: 0, count: TUTAO_CRYPT_BLOCK_SIZE)
  
  while currentOffset < input.endIndex {
    let end = min(currentOffset + TUTAO_CRYPT_BLOCK_SIZE, input.endIndex)
    let inputSlice = input[currentOffset..<end]
    currentOffset = end
    
    let cryptoActionResult = inputSlice.withUnsafeBytes { inputBytes in
      CCCryptorUpdate(cryptor,
                      inputBytes.baseAddress,
                      inputBytes.count,
                      &outputBuffer,
                      outputBuffer.count,
                      &outputBufferLength)
    }
    if cryptoActionResult != kCCSuccess {
      throw TUTErrorFactory.createError(withDomain: TUT_CRYPTO_ERROR, message: "CCCryptorUpdate returned \(cryptoActionResult)")
    }
    
    output.append(contentsOf: outputBuffer[0..<outputBufferLength])
  }
  
  let finalResult = CCCryptorFinal(cryptor, &outputBuffer, outputBuffer.count, &outputBufferLength)
  if finalResult != kCCSuccess {
    throw TUTErrorFactory.createError(withDomain: TUT_CRYPTO_ERROR, message: "CCCryptorFinal returned \(finalResult)")
  }
  
  output.append(contentsOf: outputBuffer[0..<outputBufferLength])
}

private func hmac256(withKey key: Data, forEncryptedData data: ArraySlice<UInt8>) -> [UInt8] {
  var hmacDigest = [UInt8](repeating: 0, count: MAC_DIGEST_LENGTH)
  key.withUnsafeBytes{keyPtr in
    data.withUnsafeBytes{dataPtr in
      CCHmac(CCHmacAlgorithm(kCCHmacAlgSHA256), keyPtr.baseAddress, keyPtr.count, dataPtr.baseAddress, dataPtr.count, &hmacDigest)
    }
  }

  return hmacDigest
}

private func getSubKeys(withAESKey key: Data, withMAC: Bool) throws -> SubKeys {
  if !withMAC {
    return SubKeys(encryptionKey: key, macKey: nil)
  }
  let digest: Data
  switch key.count {
  case Int(kCCKeySizeAES128):
    digest = TUTCrypto.sha256(key);
    break;
  case Int(kCCKeySizeAES256):
    digest = TUTCrypto.sha512(key);
    break;
  default:
    throw TUTErrorFactory.createError(withDomain: TUT_CRYPTO_ERROR, message: "can't generate subkeys for encryption key of length \(key.count)")
  }

  let median = digest.count / 2
  return SubKeys(encryptionKey: digest[0..<median], macKey: digest[median..<digest.count])
}
