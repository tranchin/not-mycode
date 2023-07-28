import { getArgon2Module } from "../lib/loader.js"
import { argon2idHashRaw } from "../lib/index.js"

function arrayHasPrefix(array, prefix, offset) {
	// Using for loops with offset because it's faster than making slices and comparing the whole slice with .same()
	if (offset == null) {
		offset = 0
	}
	const prefixLength = prefix.length
	for (let i = 0; i < prefixLength; i++) {
		if (array[i + offset] !== prefix[i]) {
			return false
		}
	}
	return true
}

function findFirstOccurrence(haystack, needle) {
	const haystackLength = haystack.length
	const needleLength = needle.length
	const searchSpan = haystackLength - needleLength
	if (searchSpan < 0) {
		return null
	}
	for (let i = 0; i < searchSpan; i++) {
		if (arrayHasPrefix(haystack, needle, i)) {
			return i
		}
	}
	return null
}

// Calculate our hash. We get the argon2 module here because it's a singleton and we want to check it.
const module = await getArgon2Module()
const password = new TextEncoder("UTF-8").encode("password1234")
const salt = new TextEncoder("UTF-8").encode("this is my salt")
const hash = await argon2idHashRaw(2, 19 * 1024, 1, password, salt, 32)

/**
 * Checks if the password has leaked (i.e. still remains somewhere in the buffer)
 */
function testPasswordLeakage() {
	// Find if the password has leaked somewhere in the buffer.
	const fullBuffer = new Uint8Array(module.exports.memory.buffer)
	const firstOccurrence = findFirstOccurrence(fullBuffer, password)
	if (firstOccurrence) {
		throw new Error(`Password leaked @ 0x${firstOccurrence.toString(16).toUpperCase()}`)
	}
}

/**
 * Checks accuracy of the hash calculated
 */
function checkAccuracy() {
	// Derived from a few existing implementations of Argon2id with the same parameters
	const expectedResult = new Uint8Array([
		0x30, 0x55, 0xf9, 0x7f, 0x5c, 0x76, 0xfe, 0x7c, 0xd9, 0x70, 0xa4, 0xe5, 0xef, 0xb3, 0xcb, 0x03, 0x05, 0x11, 0xaa, 0xee, 0xf4, 0x37, 0x31, 0x08, 0x4e,
		0x9e, 0x31, 0x4b, 0x52, 0x3a, 0x8c, 0x56,
	])
	if (hash.length !== expectedResult.length && !arrayHasPrefix(hash, expectedResult)) {
		throw new Error(`Incorrect hash: ${hash} gotten, expected ${expectedResult}`)
	}
}

testPasswordLeakage()
checkAccuracy()
