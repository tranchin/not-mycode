// @ts-ignore[untyped-import]
import { uint8ArrayToBitArray } from "../misc/Utils.js"
import { Aes256Key } from "../encryption/Aes.js"
import { Argon2BrowserHashOptions, Argon2BrowserHashResult, ArgonType, hash } from "argon2-browser"

const ITERATIONS = 2
const MEMORY_IN_MB = 20 * 1024
const PARALLELISM = 1
const KEY_LENGTH = 32

const defaultOptions = {
	time: ITERATIONS,
	mem: MEMORY_IN_MB,
	hashLen: KEY_LENGTH,
	parallelism: PARALLELISM,
	type: ArgonType.Argon2id,
}

/**
 * Create a 256-bit symmetric key from the given passphrase.
 * @param pass The passphrase to use for key generation as utf8 string.
 * @param salt 16 bytes of random data
 * @return resolved with the key
 */
export async function generateKeyFromPassphrase(pass: string, salt: Uint8Array): Promise<Aes256Key> {
	const input: Argon2BrowserHashOptions = {
		...defaultOptions,
		pass,
		salt,
	}
	const result: Argon2BrowserHashResult = await hash(input)
	return uint8ArrayToBitArray(result.hash)
}
