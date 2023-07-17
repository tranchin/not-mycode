import o from "ospec"
import { bitArrayToUint8Array, generateRandomSalt } from "../lib/index.js"
import { generateKeyFromPassphrase } from "../lib/hashes/Argon2id.js"

o.spec("Argon2id", async function () {
	o("GenerateKeyFromPassphrase", async function () {
		let salt1 = generateRandomSalt()
		let salt2 = generateRandomSalt()
		let key0 = await generateKeyFromPassphrase("hello", salt1)
		let key1 = await generateKeyFromPassphrase("hello", salt1)
		let key2 = await generateKeyFromPassphrase("hello", salt2)
		let key3 = await generateKeyFromPassphrase("hellohello", salt1)
		o(key1).deepEquals(key0)
		// make sure a different password or different key result in different keys
		o(key2).notDeepEquals(key0)
		o(key3).notDeepEquals(key0)
		// test the key length to be 256 bit
		o(Array.from(bitArrayToUint8Array(key0)).length).equals(32)
		o(Array.from(bitArrayToUint8Array(key2)).length).equals(32)
		o(Array.from(bitArrayToUint8Array(key3)).length).equals(32)
	})
})
