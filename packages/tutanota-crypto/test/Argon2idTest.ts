import o from "ospec"
import { bitArrayToUint8Array, generateRandomSalt, uint8ArrayToBitArray } from "../lib/index.js"
import { generateKeyFromPassphrase } from "../lib/hashes/Argon2id.js"
import { Hex, hexToUint8Array, uint8ArrayToHex } from "@tutao/tutanota-utils"
import { Aes256Key } from "../lib/encryption/Aes.js"

function _hexToKey(hex: Hex): Aes256Key {
	return uint8ArrayToBitArray(hexToUint8Array(hex))
}

function _keyToHex(key: Aes256Key): Hex {
	return uint8ArrayToHex(bitArrayToUint8Array(key))
}

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

	o("Generate KAT", async function () {
		const passwords: Array<string> = [
			"password",
			"password1",
			"letmein",
			"?",
			"%",
			"€uropa",
			"?uropa",
			"This passphrase is relatively long, I hope I won't forget it",
			"This passphrase is relatively long, I hope I won't forget it!",
			"",
			"Vitor jagt zwölf Boxkämpfer quer über den großen Sylter Deich.",
			"Só juíza chata não vê câmera frágil e dá kiwi à ré sexy que pôs ações em baú.",
		]

		const outputs: Array<{ password: string; keyHex: string; saltHex: string }> = []
		for (let i = 0; i < passwords.length; i++) {
			const salt = generateRandomSalt()
			const key = await generateKeyFromPassphrase(passwords[i], salt)
			const keyHex = _keyToHex(key)
			outputs.push({
				password: passwords[i],
				keyHex: keyHex,
				saltHex: uint8ArrayToHex(salt),
			})
		}
		console.log("argon2idTests: ", JSON.stringify(outputs, null, 2))
	})
})
