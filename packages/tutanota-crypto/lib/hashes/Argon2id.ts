import { argon2idHashRaw } from "@tutao/tutanota-argon2id"
import { Aes256Key } from "../encryption/Aes.js"
import { sha256Hash } from "./Sha256.js"
import { stringToUtf8Uint8Array } from "@tutao/tutanota-utils"
import { uint8ArrayToBitArray } from "../misc/Utils.js"

// Per OWASP's recommendations @ https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html
const ITERATIONS = 2
const MEMORY_IN_KiB = 19 * 1024
const PARALLELISM = 1
const KEY_LENGTH = 32

/**
 * Create a 256-bit symmetric key from the given passphrase.
 * @param pass The passphrase to use for key generation as utf8 string.
 * @param salt 16 bytes of random data
 * @return resolved with the key
 */
export async function generateKeyFromPassphrase(pass: string, salt: Uint8Array): Promise<Aes256Key> {
	let hash: Uint8Array = await argon2idHashRaw(ITERATIONS, MEMORY_IN_KiB, PARALLELISM, sha256Hash(stringToUtf8Uint8Array(pass)), salt, KEY_LENGTH)
	return uint8ArrayToBitArray(hash)
}
