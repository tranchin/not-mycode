import o from "@tutao/otest"
import { aes256RandomKey, bitArrayToUint8Array, generateEccKeyPair } from "@tutao/tutanota-crypto"
import { PQFacade } from "../../../../../src/api/worker/facades/PQFacade.js"
import { WASMKyberFacade } from "../../../../../src/api/worker/facades/KyberFacade.js"
import { loadWasmModuleFromFile } from "../../../../../packages/tutanota-crypto/test/WebAssemblyTestUtils.js"

o.spec("PQFacade test", function () {
	o.spec("encapsulateDecapsulateRoundtrip", function () {
		o("should lead to same result", async function () {
			const kyberFacade = new WASMKyberFacade(await loadWasmModuleFromFile("../packages/tutanota-crypto/lib/encryption/Liboqs/liboqs.wasm"))
			const pqFacade: PQFacade = new PQFacade(kyberFacade)

			const senderIdentityKeyPair = generateEccKeyPair()
			const ephemeralKeyPair = generateEccKeyPair()

			const recipientKeys = await pqFacade.generateKeyPairs()
			const bucketKey = bitArrayToUint8Array(aes256RandomKey())
			const pqMessage = await pqFacade.encapsulate(senderIdentityKeyPair, ephemeralKeyPair, recipientKeys.toPublicKeys(), bucketKey)

			const decryptedBucketKey = await pqFacade.decapsulate(pqMessage, recipientKeys)

			o(bucketKey).deepEquals(decryptedBucketKey)
		})
	})
})