import o from "@tutao/otest"
import { UserFacade } from "../../../../../src/api/worker/facades/UserFacade.js"
import {
	GroupKey,
	GroupKeysRefTypeRef,
	GroupKeyTypeRef,
	GroupMembershipTypeRef,
	GroupTypeRef,
	KeyPairTypeRef,
	User,
	UserTypeRef,
} from "../../../../../src/api/entities/sys/TypeRefs.js"
import { aes256RandomKey, aesEncrypt, encryptKey, kyberPrivateKeyToBytes, kyberPublicKeyToBytes, PQKeyPairs } from "@tutao/tutanota-crypto"
import { createTestEntity } from "../../../TestUtils.js"
import { object, when } from "testdouble"
import { EntityClient } from "../../../../../src/api/common/EntityClient.js"
import { PQFacade } from "../../../../../src/api/worker/facades/PQFacade.js"
import { WASMKyberFacade } from "../../../../../src/api/worker/facades/KyberFacade.js"
import { loadLibOQSWASM } from "../WASMTestUtils.js"

o.spec("UserFacadeTest", function () {
	o("a fresh UserFacade doesn't think it's logged or partially logged in", function () {
		const facade = new UserFacade()
		o(facade.isPartiallyLoggedIn()).equals(false)
		o(facade.isFullyLoggedIn()).equals(false)
	})

	o("a user facade doesn't think it's logged in after receiving an accessToken but no user or groupKeys", function () {
		const facade = new UserFacade()
		facade.setAccessToken("hello.")
		o(facade.isPartiallyLoggedIn()).equals(false)
		o(facade.isFullyLoggedIn()).equals(false)
	})

	o("a user facade doesn't think it's logged in fully after receiving a user but no groupKeys", function () {
		const facade = new UserFacade()
		facade.setAccessToken("hello.")
		facade.setUser({} as User)
		o(facade.isPartiallyLoggedIn()).equals(true)
		o(facade.isFullyLoggedIn()).equals(false)
	})

	o("loadKeyPair loads former key", async function (): Promise<void> {
		const facade = new UserFacade()
		const pqFacade = new PQFacade(new WASMKyberFacade(await loadLibOQSWASM()))
		const formerKeysDecrypted: BitArray[] = []
		const formerKeyPairsDecrypted: PQKeyPairs[] = []
		for (let i = 0; i < 10; i++) {
			formerKeysDecrypted.push(aes256RandomKey())
			formerKeyPairsDecrypted.push(await pqFacade.generateKeyPairs())
		}
		const passphraseKey = aes256RandomKey()
		const userGroupKey = aes256RandomKey()
		const currentGroupKeyVersion = formerKeysDecrypted.length

		const currentGroupKey = { object: aes256RandomKey(), version: Number(currentGroupKeyVersion) }
		const formerKeys: GroupKey[] = []
		let lastKey = currentGroupKey.object
		let lastVersion = currentGroupKeyVersion
		for (let i = formerKeysDecrypted.length - 1; i >= 0; i--) {
			const key: GroupKey = createTestEntity(GroupKeyTypeRef)
			key._id = ["list", i.toString()]
			key.ownerEncGKey = encryptKey(lastKey, formerKeysDecrypted[i])

			const pqKeyPair = formerKeyPairsDecrypted[i]
			key.keyPair = createTestEntity(KeyPairTypeRef, {
				version: i.toString(),
				pubEccKey: pqKeyPair.eccKeyPair.publicKey,
				pubKyberKey: kyberPublicKeyToBytes(pqKeyPair.kyberKeyPair.publicKey),
				symEncPrivEccKey: aesEncrypt(formerKeysDecrypted[i], pqKeyPair.eccKeyPair.privateKey),
				symEncPrivKyberKey: aesEncrypt(formerKeysDecrypted[i], kyberPrivateKeyToBytes(pqKeyPair.kyberKeyPair.privateKey)),
			})
			lastKey = formerKeysDecrypted[i]
			lastVersion = i
			formerKeys.unshift(key)
		}

		const currentKeys = createTestEntity(KeyPairTypeRef)
		const group = createTestEntity(GroupTypeRef, {
			_id: "my group",
			currentKeys,
			formerGroupKeys: createTestEntity(GroupKeysRefTypeRef, { list: "list" }),
		})

		const entityClient: EntityClient = object<EntityClient>()
		when(entityClient.load(GroupTypeRef, group._id)).thenResolve(group)
		when(entityClient.loadAll(GroupKeyTypeRef, group.formerGroupKeys!.list)).thenDo(() => [...formerKeys])

		const user: User = createTestEntity(UserTypeRef, {
			userGroup: createTestEntity(GroupMembershipTypeRef, {
				group: "some group",
				symEncGKey: encryptKey(passphraseKey, userGroupKey),
			}),
			memberships: [
				createTestEntity(GroupMembershipTypeRef, {
					group: group._id,
					groupKeyVersion: currentGroupKey.version.toString(),
					symEncGKey: encryptKey(userGroupKey, currentGroupKey.object),
				}),
			],
		})
		facade.setAccessToken("qawsedrftgzh")
		facade.setUser(user)
		facade.unlockUserGroupKey(passphraseKey)

		for (let i = 0; i < 10; i++) {
			const keypair = (await facade.loadKeypair(group._id, i, entityClient)) as PQKeyPairs
			o(keypair).deepEquals(formerKeyPairsDecrypted[i])
		}
	})
})
