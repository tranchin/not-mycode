import { EccPublicKey } from "@tutao/tutanota-crypto"
import { assert, byteArraysToBytes, bytesToByteArrays, concat } from "@tutao/tutanota-utils"

export const PQMESSAGE_VERSION: number = 0

export type PQMessage = {
	protocolVersion: number
	senderIdentityPubKey: EccPublicKey
	ephemeralPubKey: EccPublicKey
	encapsulation: PQBucketKeyEncapsulation
}

export type PQBucketKeyEncapsulation = {
	kyberCipherText: Uint8Array
	kekEncBucketKey: Uint8Array
}

export function decodePQMessage(encoded: Uint8Array): PQMessage {
	assert(() => encoded.length > 1, "encoded pq message is too short: " + encoded.length)
	const version = encoded[0]
	assert(() => version === PQMESSAGE_VERSION, `can't decode unknown or unsupported PQMessage version ${version}`)

	const pqMessageParts = bytesToByteArrays(encoded.subarray(1), 4)
	return {
		protocolVersion: version,
		senderIdentityPubKey: pqMessageParts[0],
		ephemeralPubKey: pqMessageParts[1],
		encapsulation: {
			kyberCipherText: pqMessageParts[2],
			kekEncBucketKey: pqMessageParts[3],
		},
	}
}

export function encodePQMessage({ protocolVersion, senderIdentityPubKey, ephemeralPubKey, encapsulation }: PQMessage): Uint8Array {
	assert(() => protocolVersion === PQMESSAGE_VERSION, `can't encode unknown or unsupported PQMessage version ${protocolVersion}`)
	const encodedPqMessageParts = byteArraysToBytes([senderIdentityPubKey, ephemeralPubKey, encapsulation.kyberCipherText, encapsulation.kekEncBucketKey])
	return concat(new Uint8Array([protocolVersion]), encodedPqMessageParts)
}
