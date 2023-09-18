import Foundation
import XCTest
@testable import tutanota

// used for testing Swift code
class CompatibilityTestSwift: XCTestCase {
  var testData: [String: Any]?
  
  override func setUp() async throws {
    try await super.setUp()
    
    let jsonUrl = Bundle(for: self.classForCoder).url(forResource: "CompatibilityTestData", withExtension: "json")!
    let jsonData = try Data.init(contentsOf: jsonUrl)
    self.testData = try JSONSerialization.jsonObject(with: jsonData) as? [String: Any]
  }
  
  func testArgon2id() {
    let ARGON2ID_HASH_LENGTH: Int = 32
    let ARGON2ID_ITERATIONS: UInt = 4
    let ARGON2ID_PARALLELISM: UInt = 1
    let ARGON2ID_MEMORY_COST: UInt = 32 * 1024
    
    let tests = (testData!["argon2idTests"] as? [[String: String]])!
    for test in tests {
      let password = TUTEncodingConverter.string(toBytes: test["password"]!)
      let expectedHash = TUTEncodingConverter.hex(toBytes: test["keyHex"]!)
      let salt = TUTEncodingConverter.hex(toBytes: test["saltHex"]!)
      let result = try! generateArgon2idHash(ofPassword: password, ofHashLength: ARGON2ID_HASH_LENGTH, withSalt: salt, withIterations: ARGON2ID_ITERATIONS, withParallelism: ARGON2ID_PARALLELISM, withMemoryCost: ARGON2ID_MEMORY_COST)
      
      XCTAssertEqual(expectedHash, result)
    }
  }
  
  func testAes128() throws {
    try doAes(testKey: "aes128Tests", withMAC: false, aesDecryptFunction: aes128DecryptWithoutMAC)
  }
  
  func testAes128Mac() throws {
    try doAes(testKey: "aes128MacTests", withMAC: true, aesDecryptFunction: aesDecrypt(fileData:withKey:))
  }
  
  func testAes256() throws {
    try doAes(testKey: "aes256Tests", withMAC: true, aesDecryptFunction: aesDecrypt(fileData:withKey:))
  }
  
  private func doAes(testKey: String, withMAC: Bool, aesDecryptFunction: (_ fileData: Data, _ key: Data) throws -> Data) throws {
    let tests = (testData![testKey] as? [[String: Any]])!
    for test in tests {
      let iv = TUTEncodingConverter.base64(toBytes: test["ivBase64"]! as! String)
      let plainText = TUTEncodingConverter.base64(toBytes: test["plainTextBase64"]! as! String)
      let cipherText = TUTEncodingConverter.base64(toBytes: test["cipherTextBase64"]! as! String)
      let key = TUTEncodingConverter.hex(toBytes: test["hexKey"]! as! String)
      
      let encrypted = try aesEncrypt(data: plainText, withKey: key, withIV: iv, withMAC: withMAC)
      XCTAssertEqual(cipherText, encrypted)
      
      let decrypted = try aesDecryptFunction(encrypted, key)
      XCTAssertEqual(plainText, decrypted)
    }
  }
}
