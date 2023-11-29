import {
	arrayEquals,
	assertNotNull,
	base64ToUint8Array,
	downcast,
	isSameTypeRef,
	isSameTypeRefByAttr,
	neverNull,
	ofClass,
	promiseMap,
	stringToUtf8Uint8Array,
	TypeRef,
	uint8ArrayToBase64,
	uint8ArrayToHex,
} from "@tutao/tutanota-utils"
import { BucketPermissionType, EncryptionAuthStatus, GroupType, PermissionType, SYSTEM_GROUP_MAIL_ADDRESS } from "../../common/TutanotaConstants"
import { HttpMethod, resolveTypeReference } from "../../common/EntityFunctions"
import type { BucketKey, BucketPermission, GroupMembership, InstanceSessionKey, Permission } from "../../entities/sys/TypeRefs.js"
import {
	BucketKeyTypeRef,
	BucketPermissionTypeRef,
	createInstanceSessionKey,
	createPublicKeyGetIn,
	createPublicKeyPutIn,
	createUpdatePermissionKeyData,
	GroupInfoTypeRef,
	PermissionTypeRef,
	PushIdentifierTypeRef,
} from "../../entities/sys/TypeRefs.js"
import type { Contact, InternalRecipientKeyData, Mail } from "../../entities/tutanota/TypeRefs.js"
import {
	ContactTypeRef,
	createEncryptTutanotaPropertiesData,
	createInternalRecipientKeyData,
	MailTypeRef,
	TutanotaPropertiesTypeRef,
} from "../../entities/tutanota/TypeRefs.js"
import { typeRefToPath } from "../rest/EntityRestClient"
import { LockedError, NotFoundError, PayloadTooLargeError, TooManyRequestsError } from "../../common/error/RestError"
import { SessionKeyNotFoundError } from "../../common/error/SessionKeyNotFoundError" // importing with {} from CJS modules is not supported for dist-builds currently (must be a systemjs builder bug)
import { CryptoError } from "../../common/error/CryptoError"
import { birthdayToIsoDate, oldBirthdayToBirthday } from "../../common/utils/BirthdayUtils"
import type { Entity, SomeEntity, TypeModel } from "../../common/EntityTypes"
import { assertWorkerOrNode } from "../../common/Env"
import type { EntityClient } from "../../common/EntityClient"
import { RestClient } from "../rest/RestClient"
import {
	Aes128Key,
	aes128RandomKey,
	aesEncrypt,
	AesKey,
	bitArrayToUint8Array,
	bytesToKyberPublicKey,
	decryptKey,
	EccKeyPair,
	EccPublicKey,
	ENABLE_MAC,
	encryptEccKey,
	encryptKey,
	generateEccKeyPair,
	hexToRsaPublicKey,
	IV_BYTE_LENGTH,
	PQKeyPairs,
	PQPublicKeys,
	random,
	RsaEccKeyPair,
	RsaKeyPair,
	RsaPrivateKey,
	RsaPublicKey,
	uint8ArrayToBitArray,
} from "@tutao/tutanota-crypto"
import { RecipientNotResolvedError } from "../../common/error/RecipientNotResolvedError"
import type { RsaImplementation } from "./RsaImplementation"
import { IServiceExecutor } from "../../common/ServiceRequest"
import { EncryptTutanotaPropertiesService } from "../../entities/tutanota/Services"
import { PublicKeyService, UpdatePermissionKeyService } from "../../entities/sys/Services"
import { UserFacade } from "../facades/UserFacade"
import { elementIdPart } from "../../common/utils/EntityUtils.js"
import { InstanceMapper } from "./InstanceMapper.js"
import { OwnerEncSessionKeysUpdateQueue } from "./OwnerEncSessionKeysUpdateQueue.js"
import { PQFacade } from "../facades/PQFacade.js"
import { decodePQMessage, encodePQMessage } from "../facades/PQMessage.js"
import { Versioned } from "@tutao/tutanota-utils/dist/Utils.js"

assertWorkerOrNode()

export function encryptBytes(sk: Aes128Key, value: Uint8Array): Uint8Array {
	return aesEncrypt(sk, value, random.generateRandomData(IV_BYTE_LENGTH), true, ENABLE_MAC)
}

export function encryptString(sk: Aes128Key, value: string): Uint8Array {
	return aesEncrypt(sk, stringToUtf8Uint8Array(value), random.generateRandomData(IV_BYTE_LENGTH), true, ENABLE_MAC)
}

export class CryptoFacade {
	constructor(
		private readonly userFacade: UserFacade,
		private readonly entityClient: EntityClient,
		private readonly restClient: RestClient,
		private readonly rsa: RsaImplementation,
		private readonly serviceExecutor: IServiceExecutor,
		private readonly instanceMapper: InstanceMapper,
		private readonly ownerEncSessionKeysUpdateQueue: OwnerEncSessionKeysUpdateQueue,
		private readonly pq: PQFacade,
	) {}

	async applyMigrationsForInstance<T>(decryptedInstance: T): Promise<T> {
		const instanceType = downcast<Entity>(decryptedInstance)._type

		if (isSameTypeRef(instanceType, ContactTypeRef)) {
			const contact = downcast<Contact>(decryptedInstance)

			try {
				if (!contact.birthdayIso && contact.oldBirthdayAggregate) {
					contact.birthdayIso = birthdayToIsoDate(contact.oldBirthdayAggregate)
					contact.oldBirthdayAggregate = null
					contact.oldBirthdayDate = null
					await this.entityClient.update(contact)
				} else if (!contact.birthdayIso && contact.oldBirthdayDate) {
					contact.birthdayIso = birthdayToIsoDate(oldBirthdayToBirthday(contact.oldBirthdayDate))
					contact.oldBirthdayDate = null
					await this.entityClient.update(contact)
				} else if (contact.birthdayIso && (contact.oldBirthdayAggregate || contact.oldBirthdayDate)) {
					contact.oldBirthdayAggregate = null
					contact.oldBirthdayDate = null
					await this.entityClient.update(contact)
				}
			} catch (e) {
				if (!(e instanceof LockedError)) {
					throw e
				}
			}
		}

		return decryptedInstance
	}

	async resolveSessionKeyForInstance(instance: SomeEntity): Promise<Aes128Key | null> {
		const typeModel = await resolveTypeReference(instance._type)
		return this.resolveSessionKey(typeModel, instance)
	}

	/** Helper for the rare cases when we needed it on the client side. */
	async resolveSessionKeyForInstanceBinary(instance: SomeEntity): Promise<Uint8Array | null> {
		const key = await this.resolveSessionKeyForInstance(instance)
		return key == null ? null : bitArrayToUint8Array(key)
	}

	/** Resolve a session key an {@param instance} using an already known {@param ownerKey}. */
	resolveSessionKeyWithOwnerKey(instance: Record<string, any>, ownerKey: AesKey): Aes128Key {
		let key = instance._ownerEncSessionKey
		if (typeof key === "string") {
			key = base64ToUint8Array(instance._ownerEncSessionKey)
		}

		return decryptKey(ownerKey, key)
	}

	async decryptSessionKey(instance: Record<string, any>, ownerEncSessionKey: CiphertextKey): Promise<AesKey> {
		const gk = await this.userFacade.loadSymGroupKey(instance._ownerGroup, ownerEncSessionKey.encryptingKeyVersion, this.entityClient)
		return decryptKey(gk, ownerEncSessionKey.key)
	}

	/**
	 * Returns the session key for the provided type/instance:
	 * * null, if the instance is unencrypted
	 * * the decrypted _ownerEncSessionKey, if it is available
	 * * the public decrypted session key, otherwise
	 *
	 * @param typeModel: the type model of the instance
	 * @param instance The unencrypted (client-side) instance or encrypted (server-side) object literal
	 */
	async resolveSessionKey(typeModel: TypeModel, instance: Record<string, any>): Promise<AesKey | null> {
		try {
			if (!typeModel.encrypted) {
				return null
			}
			if (instance.bucketKey) {
				// if we have a bucket key, then we need to cache the session keys stored in the bucket key for details, files, etc.
				// we need to do this BEFORE we check the owner enc session key
				const bucketKey = await this.convertBucketKeyToInstanceIfNecessary(instance.bucketKey)
				return this.resolveWithBucketKey(bucketKey, instance, typeModel)
			} else if (instance._ownerEncSessionKey && this.userFacade.isFullyLoggedIn() && this.userFacade.hasGroup(instance._ownerGroup)) {
				const gk = await this.userFacade.loadSymGroupKey(instance._ownerGroup, Number(instance._ownerKeyVersion ?? 0), this.entityClient)
				return this.resolveSessionKeyWithOwnerKey(instance, gk)
			} else if (instance.ownerEncSessionKey) {
				// Likely a DataTransferType, so this is a service.
				const gk = await this.userFacade.loadSymGroupKey(
					this.userFacade.getGroupId(GroupType.Mail),
					Number(instance.ownerKeyVersion ?? 0),
					this.entityClient,
				)
				return this.resolveSessionKeyWithOwnerKey(instance, gk)
			} else {
				// See PermissionType jsdoc for more info on permissions
				const permissions = await this.entityClient.loadAll(PermissionTypeRef, instance._permissions)
				return this.trySymmetricPermission(permissions) ?? (await this.resolveWithPublicOrExternalPermission(permissions, instance, typeModel))
			}
		} catch (e) {
			if (e instanceof CryptoError) {
				console.log("failed to resolve session key", e)
				throw new SessionKeyNotFoundError("Crypto error while resolving session key for instance " + instance._id)
			} else {
				throw e
			}
		}
	}

	/**
	 * Takes a freshly JSON-parsed, unmapped object and apply migrations as necessary
	 * @param typeRef
	 * @param data
	 * @return the unmapped and still encrypted instance
	 */
	async applyMigrations<T extends SomeEntity>(typeRef: TypeRef<T>, data: any): Promise<any> {
		if (isSameTypeRef(typeRef, GroupInfoTypeRef) && data._ownerGroup == null) {
			return this.applyCustomerGroupOwnershipToGroupInfo(data)
		} else if (isSameTypeRef(typeRef, TutanotaPropertiesTypeRef) && data._ownerEncSessionKey == null) {
			return this.encryptTutanotaProperties(data)
		} else if (isSameTypeRef(typeRef, PushIdentifierTypeRef) && data._ownerEncSessionKey == null) {
			return this.addSessionKeyToPushIdentifier(data)
		} else {
			return data
		}
	}

	/**
	 * In case the given bucketKey is a literal the literal will be converted to an instance and return. In case the BucketKey is already an instance the instance is returned.
	 * @param bucketKeyInstanceOrLiteral The bucket key as literal or instance
	 */
	async convertBucketKeyToInstanceIfNecessary(bucketKeyInstanceOrLiteral: Record<string, any>): Promise<BucketKey> {
		if (!this.isLiteralInstance(bucketKeyInstanceOrLiteral)) {
			// bucket key was already decoded from base 64
			return bucketKeyInstanceOrLiteral as BucketKey
		} else {
			// decryptAndMapToInstance is misleading here, but we want to map the BucketKey aggregate and its session key from a literal to an instance
			// to have the encrypted keys in binary format and not a base 64. There is actually no decryption ongoing, just mapToInstance.
			const bucketKeyTypeModel = await resolveTypeReference(BucketKeyTypeRef)
			return (await this.instanceMapper.decryptAndMapToInstance(bucketKeyTypeModel, bucketKeyInstanceOrLiteral, null)) as BucketKey
		}
	}

	public async resolveWithBucketKey(bucketKey: BucketKey, instance: Record<string, any>, typeModel: TypeModel): Promise<AesKey> {
		const instanceElementId = this.getElementIdFromInstance(instance)
		let decBucketKey: Aes128Key
		let unencryptedSenderAuthStatus: EncryptionAuthStatus | null = null
		let pqMessageSenderKey: EccPublicKey | null = null
		if (bucketKey.keyGroup && bucketKey.pubEncBucketKey) {
			// bucket key is encrypted with public key for internal recipient
			const { decryptedBucketKey, pqMessageSenderIdentityPubKey } = await this.decryptBucketKeyWithKeyPairOfGroupAndPrepareAuthentication(
				bucketKey.keyGroup,
				bucketKey.pubEncBucketKey,
				Number(bucketKey.recipientKeyVersion),
			)
			decBucketKey = decryptedBucketKey
			pqMessageSenderKey = pqMessageSenderIdentityPubKey
		} else if (bucketKey.groupEncBucketKey) {
			// secure external recipient
			let keyGroup
			if (bucketKey.keyGroup) {
				// legacy code path for old external clients that used to encrypt bucket keys with user group keys.
				// should be dropped once all old external mailboxes are cleared
				keyGroup = bucketKey.keyGroup
			} else {
				// by default, we try to decrypt the bucket key with the ownerGroupKey
				keyGroup = neverNull(instance._ownerGroup)
			}
			decBucketKey = decryptKey(this.userFacade.getGroupKey(keyGroup).object, bucketKey.groupEncBucketKey)
			unencryptedSenderAuthStatus = EncryptionAuthStatus.AES_NO_AUTHENTICATION
		} else {
			throw new SessionKeyNotFoundError(`encrypted bucket key not set on instance ${typeModel.name}`)
		}
		const { resolvedSessionKeyForInstance, instanceSessionKeys } = await this.collectAllInstanceSessionKeysAndAuthenticate(
			bucketKey,
			decBucketKey,
			instanceElementId,
			instance,
			typeModel,
			unencryptedSenderAuthStatus,
			pqMessageSenderKey,
		)

		this.ownerEncSessionKeysUpdateQueue.updateInstanceSessionKeys(instanceSessionKeys)

		if (resolvedSessionKeyForInstance) {
			// for symmetrically encrypted instances _ownerEncSessionKey is sent from the server.
			// in this case it is not yet and we need to set it because the rest of the app expects it.
			const groupKey = this.userFacade.getGroupKey(instance._ownerGroup)
			this.setOwnerEncSessionKeyAndGroup(instance as UnmappedOwnerGroupInstance, encryptKeyWithVersionedKey(groupKey, resolvedSessionKeyForInstance))
			return resolvedSessionKeyForInstance
		} else {
			throw new SessionKeyNotFoundError("no session key for instance " + instance._id)
		}
	}

	/**
	 * Returns the session key for the provided service response:
	 * * null, if the instance is unencrypted
	 * * the decrypted _ownerPublicEncSessionKey, if it is available
	 * @param typeModel
	 * @param instance The unencrypted (client-side) or encrypted (server-side) instance
	 *
	 */
	async resolveServiceSessionKey(typeModel: TypeModel, instance: Record<string, any>): Promise<AesKey | null> {
		if (instance._ownerPublicEncSessionKey) {
			const keypair = await this.userFacade.loadKeypair(instance._ownerGroup, Number(assertNotNull(instance._ownerKeyVersion)), this.entityClient)

			let decryptedBytes: Uint8Array
			if (keypair instanceof PQKeyPairs) {
				decryptedBytes = await this.pq.decapsulate(decodePQMessage(base64ToUint8Array(instance._ownerPublicEncSessionKey)), keypair)
			} else {
				const privateKey = this.getPrivateKey(keypair)
				decryptedBytes = await this.rsa.decrypt(privateKey, base64ToUint8Array(instance._ownerPublicEncSessionKey))
			}
			return uint8ArrayToBitArray(decryptedBytes)
		}

		return Promise.resolve(null)
	}

	async encryptBucketKeyForInternalRecipient(
		senderUserGroupId: Id,
		bucketKey: AesKey,
		recipientMailAddress: string,
		notFoundRecipients: Array<string>,
	): Promise<InternalRecipientKeyData | void> {
		let keyData = createPublicKeyGetIn({
			mailAddress: recipientMailAddress,
			version: null,
		})
		try {
			const publicKeyGetOut = await this.serviceExecutor.get(PublicKeyService, keyData)

			if (notFoundRecipients.length === 0) {
				const recipientPubKey = this.getPublicKey(publicKeyGetOut)
				const uint8ArrayBucketKey = bitArrayToUint8Array(bucketKey)
				let pubEncBucketKey: Uint8Array
				let senderKeyVersion: NumberString
				if (recipientPubKey instanceof PQPublicKeys) {
					const senderKeyPair = await this.userFacade.loadCurrentKeyPair(senderUserGroupId, this.entityClient)
					const senderIdentityKeyPair = await this.getOrMakeSenderIdentityKeyPair(senderKeyPair.object)
					const ephemeralKeyPair = generateEccKeyPair()
					senderKeyVersion = senderKeyPair.version.toString()
					pubEncBucketKey = encodePQMessage(await this.pq.encapsulate(senderIdentityKeyPair, ephemeralKeyPair, recipientPubKey, uint8ArrayBucketKey))
				} else {
					pubEncBucketKey = await this.rsa.encrypt(recipientPubKey, uint8ArrayBucketKey)
					senderKeyVersion = "0"
				}
				return createInternalRecipientKeyData({
					mailAddress: recipientMailAddress,
					recipientKeyVersion: publicKeyGetOut.pubKeyVersion,
					pubEncBucketKey,
					senderKeyVersion,
				})
			}
		} catch (e) {
			if (e instanceof NotFoundError) {
				notFoundRecipients.push(recipientMailAddress)
			} else if (e instanceof TooManyRequestsError) {
				throw new RecipientNotResolvedError("")
			} else {
				throw e
			}
		}
	}

	/**
	 * Returns the SenderIdentityKeyPair that is either already on the KeyPair that is being passed in,
	 * or creates a new one and writes it to the respective Group.
	 * @param senderKeyPair
	 * @param keyGroupId Id for the Group that Public Key Service might write a new IdentityKeyPair for.
	 * 						This is necessary as a User might send an E-Mail from a shared mailbox,
	 * 						for which the KeyPair should be created.
	 */
	async getOrMakeSenderIdentityKeyPair(senderKeyPair: RsaEccKeyPair | RsaKeyPair | PQKeyPairs, keyGroupId?: Id): Promise<EccKeyPair> {
		if (senderKeyPair instanceof PQKeyPairs) {
			return senderKeyPair.eccKeyPair
		} else if (this.isRsaEccKeyPair(senderKeyPair)) {
			return { publicKey: senderKeyPair.publicEccKey, privateKey: senderKeyPair.privateEccKey }
		} else {
			const newIdentityKeyPair = generateEccKeyPair()
			const keyGroup = keyGroupId ?? this.userFacade.getUserGroupId()
			const encryptionKey = this.userFacade.getGroupKey(keyGroup)
			const symEncPrivEccKey = encryptEccKey(encryptionKey.object, newIdentityKeyPair.privateKey)
			const data = createPublicKeyPutIn({ pubEccKey: newIdentityKeyPair.publicKey, symEncPrivEccKey, keyGroup })
			await this.serviceExecutor.put(PublicKeyService, data)
			return newIdentityKeyPair
		}
	}

	async authenticateSender(mailSenderAddress: string, senderIdentityPubKey: Uint8Array, publicKeyVersion: number): Promise<EncryptionAuthStatus> {
		const keyData = createPublicKeyGetIn({
			mailAddress: mailSenderAddress,
			version: publicKeyVersion.toString(),
		})

		try {
			const publicKeyGetOut = await this.serviceExecutor.get(PublicKeyService, keyData)
			return publicKeyGetOut.pubEccKey != null && arrayEquals(publicKeyGetOut.pubEccKey, senderIdentityPubKey)
				? EncryptionAuthStatus.PQ_AUTHENTICATION_SUCCEEDED
				: EncryptionAuthStatus.PQ_AUTHENTICATION_FAILED
		} catch (e) {
			if (e instanceof NotFoundError) {
				return EncryptionAuthStatus.PQ_AUTHENTICATION_FAILED
			} else {
				throw e
			}
		}
	}

	/**
	 * Creates a new _ownerEncSessionKey and assigns it to the provided entity
	 * the entity must already have an _ownerGroup
	 * @returns the generated key
	 */
	setNewOwnerEncSessionKey(model: TypeModel, entity: Record<string, any>, keyToEncryptSessionKey?: Versioned<AesKey>): AesKey | null {
		if (!entity._ownerGroup) {
			throw new Error(`no owner group set  ${JSON.stringify(entity)}`)
		}

		if (model.encrypted) {
			if (entity._ownerEncSessionKey) {
				throw new Error(`ownerEncSessionKey already set ${JSON.stringify(entity)}`)
			}

			const sessionKey = aes128RandomKey()
			const effectiveKeyToEncryptSessionKey = keyToEncryptSessionKey ?? this.userFacade.getGroupKey(entity._ownerGroup)
			const encryptedSessionKey = encryptKeyWithVersionedKey(effectiveKeyToEncryptSessionKey, sessionKey)
			entity._ownerEncSessionKey = encryptedSessionKey.key
			entity._ownerKeyVersion = effectiveKeyToEncryptSessionKey.version.toString()
			return sessionKey
		} else {
			return null
		}
	}

	private async addSessionKeyToPushIdentifier(data: any): Promise<any> {
		const userGroupKey = this.userFacade.getUserGroupKey()

		// set sessionKey for allowing encryption when old instance (< v43) is updated
		const typeModel = await resolveTypeReference(PushIdentifierTypeRef)
		await this.updateOwnerEncSessionKey(typeModel, data, userGroupKey, aes128RandomKey())
		return data
	}

	private async encryptTutanotaProperties(data: any): Promise<any> {
		const userGroupKey = this.userFacade.getUserGroupKey()

		// EncryptTutanotaPropertiesService could be removed and replaced with a Migration that writes the key
		const groupEncSessionKey = encryptKeyWithVersionedKey(userGroupKey, aes128RandomKey())
		this.setOwnerEncSessionKeyAndGroup(data, groupEncSessionKey, this.userFacade.getUserGroupId())
		const migrationData = createEncryptTutanotaPropertiesData({
			properties: data._id,
			symKeyVersion: String(userGroupKey.version),
			symEncSessionKey: groupEncSessionKey.key,
		})
		await this.serviceExecutor.post(EncryptTutanotaPropertiesService, migrationData)
		return data
	}

	private async applyCustomerGroupOwnershipToGroupInfo(data: any): Promise<any> {
		const customerGroupMembership = assertNotNull(
			this.userFacade.getLoggedInUser().memberships.find((g: GroupMembership) => g.groupType === GroupType.Customer),
		)
		const customerGroupKey = this.userFacade.getGroupKey(customerGroupMembership.group)
		const listPermissions = await this.entityClient.loadAll(PermissionTypeRef, data._id[0])

		const customerGroupPermission = listPermissions.find((p) => p.group === customerGroupMembership.group)
		if (!customerGroupPermission) throw new SessionKeyNotFoundError("Permission not found, could not apply OwnerGroup migration")
		const listKey = decryptKey(customerGroupKey.object, assertNotNull(customerGroupPermission.symEncSessionKey))
		const groupInfoSk = decryptKey(listKey, base64ToUint8Array(data._listEncSessionKey))

		this.setOwnerEncSessionKeyAndGroup(data, encryptKeyWithVersionedKey(customerGroupKey, groupInfoSk), customerGroupMembership.group)
		return data
	}

	private setOwnerEncSessionKeyAndGroup(unmappedInstance: UnmappedOwnerGroupInstance, key: CiphertextKey, ownerGroup?: Id) {
		unmappedInstance._ownerEncSessionKey = uint8ArrayToBase64(key.key)
		unmappedInstance._ownerKeyVersion = key.encryptingKeyVersion.toString()
		if (ownerGroup) {
			unmappedInstance._ownerGroup
		}
	}

	private isLiteralInstance(elementOrLiteral: Record<string, any>): boolean {
		return typeof elementOrLiteral._type === "undefined"
	}

	private trySymmetricPermission(listPermissions: Permission[]) {
		const symmetricPermission: Permission | null =
			listPermissions.find(
				(p) =>
					(p.type === PermissionType.Public_Symmetric || p.type === PermissionType.Symmetric) &&
					p._ownerGroup &&
					this.userFacade.hasGroup(p._ownerGroup),
			) ?? null

		if (symmetricPermission) {
			const gk = this.userFacade.getGroupKey(assertNotNull(symmetricPermission._ownerGroup))
			return decryptKey(gk.object, assertNotNull(symmetricPermission._ownerEncSessionKey))
		}
	}

	private async authenticateMainInstance(
		typeModel: TypeModel,
		encryptionAuthStatus: EncryptionAuthStatus | null,
		pqMessageSenderKey: Uint8Array | null,
		pqMessageSenderKeyVersion: number | null,
		instance: Record<string, any>,
		resolvedSessionKeyForInstance: number[],
		instanceSessionKeyWithOwnerEncSessionKey: InstanceSessionKey,
		decryptedSessionKey: number[],
	) {
		// TODO for which other type do we need to write this? ReceivedGroupInvitation etc.
		const isMailInstance = isSameTypeRefByAttr(MailTypeRef, typeModel.app, typeModel.name)
		if (isMailInstance) {
			if (!encryptionAuthStatus) {
				if (!pqMessageSenderKey) {
					encryptionAuthStatus = EncryptionAuthStatus.RSA_NO_AUTHENTICATION
				} else {
					const mail = (await this.instanceMapper.decryptAndMapToInstance(typeModel, instance, resolvedSessionKeyForInstance)) as Mail
					const senderMailAddress = mail.confidential ? mail.sender.address : SYSTEM_GROUP_MAIL_ADDRESS
					encryptionAuthStatus = await this.authenticateSender(senderMailAddress, pqMessageSenderKey, assertNotNull(pqMessageSenderKeyVersion))
				}
			}
			instanceSessionKeyWithOwnerEncSessionKey.encryptionAuthStatus = aesEncrypt(decryptedSessionKey, stringToUtf8Uint8Array(encryptionAuthStatus))
		}
	}

	private async resolveWithPublicOrExternalPermission(listPermissions: Permission[], instance: Record<string, any>, typeModel: TypeModel): Promise<AesKey> {
		const pubOrExtPermission = listPermissions.find((p) => p.type === PermissionType.Public || p.type === PermissionType.External) ?? null

		if (pubOrExtPermission == null) {
			const typeName = `${typeModel.app}/${typeModel.name}`
			throw new SessionKeyNotFoundError(`could not find permission for instance of type ${typeName} with id ${this.getElementIdFromInstance(instance)}`)
		}

		const bucketPermissions = await this.entityClient.loadAll(BucketPermissionTypeRef, assertNotNull(pubOrExtPermission.bucket).bucketPermissions)
		const bucketPermission = bucketPermissions.find(
			(bp) => (bp.type === BucketPermissionType.Public || bp.type === BucketPermissionType.External) && pubOrExtPermission._ownerGroup === bp._ownerGroup,
		)

		// find the bucket permission with the same group as the permission and public type
		if (bucketPermission == null) {
			throw new SessionKeyNotFoundError("no corresponding bucket permission found")
		}

		if (bucketPermission.type === BucketPermissionType.External) {
			return this.decryptWithExternalBucket(bucketPermission, pubOrExtPermission, instance)
		} else {
			return await this.decryptWithPublicBucket(bucketPermission, instance, pubOrExtPermission, typeModel)
		}
	}

	private async decryptWithExternalBucket(
		bucketPermission: BucketPermission,
		pubOrExtPermission: Permission,
		instance: Record<string, any>,
	): Promise<AesKey> {
		let bucketKey

		if (bucketPermission.ownerEncBucketKey != null) {
			const ownerGroupKey = await this.userFacade.loadSymGroupKey(
				neverNull(bucketPermission._ownerGroup),
				Number(bucketPermission.ownerKeyVersion),
				this.entityClient,
			)
			bucketKey = decryptKey(ownerGroupKey, bucketPermission.ownerEncBucketKey)
		} else if (bucketPermission.symEncBucketKey) {
			const userGroupKey = await this.userFacade.loadSymGroupKey(
				this.userFacade.getUserGroupId(),
				Number(bucketPermission.symKeyVersion),
				this.entityClient,
			)
			bucketKey = decryptKey(userGroupKey, bucketPermission.symEncBucketKey)
		} else {
			throw new SessionKeyNotFoundError(
				`BucketEncSessionKey is not defined for Permission ${pubOrExtPermission._id.toString()} (Instance: ${JSON.stringify(instance)})`,
			)
		}

		return decryptKey(bucketKey, neverNull(pubOrExtPermission.bucketEncSessionKey))
	}

	/**
	 * Resolves the session key for the provided instance and collects all other instances'
	 * session keys in order to update them.
	 */
	private async collectAllInstanceSessionKeysAndAuthenticate(
		bucketKey: BucketKey,
		decBucketKey: number[],
		instanceElementId: string,
		instance: Record<string, any>,
		typeModel: TypeModel,
		encryptionAuthStatus: EncryptionAuthStatus | null,
		pqMessageSenderKey: EccPublicKey | null,
	): Promise<{ resolvedSessionKeyForInstance: AesKey | undefined; instanceSessionKeys: InstanceSessionKey[] }> {
		let resolvedSessionKeyForInstance: AesKey | undefined = undefined
		const instanceSessionKeys = await promiseMap(bucketKey.bucketEncSessionKeys, async (instanceSessionKey) => {
			const decryptedSessionKey = decryptKey(decBucketKey, instanceSessionKey.symEncSessionKey)
			const groupKey = await this.userFacade.loadSymGroupKey(instance._ownerGroup, Number(instance._ownerKeyVersion ?? 0), this.entityClient)
			const ownerEncSessionKey = encryptKey(groupKey, decryptedSessionKey)
			const instanceSessionKeyWithOwnerEncSessionKey = createInstanceSessionKey(instanceSessionKey)
			if (instanceElementId == instanceSessionKey.instanceId) {
				resolvedSessionKeyForInstance = decryptedSessionKey
				// we can only authenticate once we have the session key
				// because we need to check if the confidential flag is set, which is encrypted still
				// we need to do it here at the latest because we must write the flag when updating the session key on the instance
				await this.authenticateMainInstance(
					typeModel,
					encryptionAuthStatus,
					pqMessageSenderKey,
					Number(bucketKey.senderKeyVersion ?? "0"),
					instance,
					resolvedSessionKeyForInstance,
					instanceSessionKeyWithOwnerEncSessionKey,
					decryptedSessionKey,
				)
			}
			instanceSessionKeyWithOwnerEncSessionKey.symEncSessionKey = ownerEncSessionKey
			return instanceSessionKeyWithOwnerEncSessionKey
		})
		return { resolvedSessionKeyForInstance, instanceSessionKeys }
	}

	private async decryptBucketKeyWithKeyPairOfGroupAndPrepareAuthentication(
		keyPairGroupId: Id,
		pubEncBucketKey: Uint8Array,
		recipientKeyVersion: number,
	): Promise<{
		decryptedBucketKey: AesKey
		pqMessageSenderIdentityPubKey: EccPublicKey | null
	}> {
		const keyPair = await this.userFacade.loadKeypair(keyPairGroupId, recipientKeyVersion, this.entityClient)
		if (keyPair instanceof PQKeyPairs) {
			const pqMessage = decodePQMessage(pubEncBucketKey)
			const decryptedBucketKey = await this.pq.decapsulate(pqMessage, keyPair)
			return {
				decryptedBucketKey: uint8ArrayToBitArray(decryptedBucketKey),
				pqMessageSenderIdentityPubKey: pqMessage.senderIdentityPubKey,
			}
		} else {
			const privateKey = this.getPrivateKey(keyPair)
			const decryptedBucketKey = await this.rsa.decrypt(privateKey, pubEncBucketKey)
			return {
				decryptedBucketKey: uint8ArrayToBitArray(decryptedBucketKey),
				pqMessageSenderIdentityPubKey: null,
			}
		}
	}

	private async decryptWithPublicBucket(
		bucketPermission: BucketPermission,
		instance: Record<string, any>,
		pubOrExtPermission: Permission,
		typeModel: TypeModel,
	): Promise<Aes128Key> {
		const pubEncBucketKey = bucketPermission.pubEncBucketKey
		if (pubEncBucketKey == null) {
			throw new SessionKeyNotFoundError(
				`PubEncBucketKey is not defined for BucketPermission ${bucketPermission._id.toString()} (Instance: ${JSON.stringify(instance)})`,
			)
		}
		const bucketEncSessionKey = pubOrExtPermission.bucketEncSessionKey
		if (bucketEncSessionKey == null) {
			throw new SessionKeyNotFoundError(
				`BucketEncSessionKey is not defined for Permission ${pubOrExtPermission._id.toString()} (Instance: ${JSON.stringify(instance)})`,
			)
		}

		const { decryptedBucketKey } = await this.decryptBucketKeyWithKeyPairOfGroupAndPrepareAuthentication(
			bucketPermission.group,
			pubEncBucketKey,
			Number(assertNotNull(bucketPermission.pubKeyVersion)),
		)

		const sk = decryptKey(decryptedBucketKey, bucketEncSessionKey)

		if (bucketPermission._ownerGroup) {
			// is not defined for some old AccountingInfos
			let bucketPermissionOwnerGroupKey = this.userFacade.getGroupKey(neverNull(bucketPermission._ownerGroup))
			this.userFacade.getGroupKey(bucketPermission.group)
			await this.updateWithSymPermissionKey(typeModel, instance, pubOrExtPermission, bucketPermission, bucketPermissionOwnerGroupKey, sk).catch(
				ofClass(NotFoundError, () => {
					console.log("w> could not find instance to update permission")
				}),
			)
		}
		return sk
	}

	/**
	 * Updates the given public permission with the given symmetric key for faster access if the client is the leader and otherwise does nothing.
	 * @param typeModel: the type model of the instance
	 * @param instance The unencrypted (client-side) or encrypted (server-side) instance
	 * @param permission The permission.
	 * @param bucketPermission The bucket permission.
	 * @param permissionOwnerGroupKey The symmetric group key for the owner group on the permission.
	 * @param sessionKey The symmetric session key.
	 */
	private async updateWithSymPermissionKey(
		typeModel: TypeModel,
		instance: Record<string, any>,
		permission: Permission,
		bucketPermission: BucketPermission,
		permissionOwnerGroupKey: Versioned<Aes128Key>,
		sessionKey: Aes128Key,
	): Promise<void> {
		if (!this.isLiteralInstance(instance) || !this.userFacade.isLeader()) {
			// do not update the session key in case of an unencrypted (client-side) instance
			// or in case we are not the leader client
			return
		}

		if (!instance._ownerEncSessionKey && permission._ownerGroup === instance._ownerGroup) {
			return this.updateOwnerEncSessionKey(typeModel, instance, permissionOwnerGroupKey, sessionKey)
		} else {
			// instances shared via permissions (e.g. body)
			const encryptedKey = encryptKeyWithVersionedKey(permissionOwnerGroupKey, sessionKey)
			let updateService = createUpdatePermissionKeyData({
				ownerKeyVersion: String(encryptedKey.encryptingKeyVersion),
				ownerEncSessionKey: encryptedKey.key,
				permission: permission._id,
				bucketPermission: bucketPermission._id,
				symEncSessionKey: null, // legacy, should no longer be set. can be removed?
			})
			await this.serviceExecutor.post(UpdatePermissionKeyService, updateService)
		}
	}

	private updateOwnerEncSessionKey(
		typeModel: TypeModel,
		instance: Record<string, any>,
		ownerGroupKey: Versioned<Aes128Key>,
		sessionKey: Aes128Key,
	): Promise<void> {
		this.setOwnerEncSessionKeyAndGroup(instance as UnmappedOwnerGroupInstance, encryptKeyWithVersionedKey(ownerGroupKey, sessionKey))
		// we have to call the rest client directly because instance is still the encrypted server-side version
		const path = typeRefToPath(new TypeRef(typeModel.app, typeModel.name)) + "/" + (instance._id instanceof Array ? instance._id.join("/") : instance._id)
		const headers = this.userFacade.createAuthHeaders()
		headers.v = typeModel.version
		return this.restClient
			.request(path, HttpMethod.PUT, {
				headers,
				body: JSON.stringify(instance),
				queryParams: { updateOwnerEncSessionKey: "true" },
			})
			.catch(
				ofClass(PayloadTooLargeError, (e) => {
					console.log("Could not update owner enc session key - PayloadTooLargeError", e)
				}),
			)
	}

	private getElementIdFromInstance(instance: Record<string, any>): Id {
		if (typeof instance._id === "string") {
			return instance._id
		} else {
			const idTuple = instance._id as IdTuple
			return elementIdPart(idTuple)
		}
	}

	public getPublicKey(keyPair: { pubRsaKey: null | Uint8Array; pubEccKey: null | Uint8Array; pubKyberKey: null | Uint8Array }): RsaPublicKey | PQPublicKeys {
		if (keyPair.pubRsaKey) {
			return hexToRsaPublicKey(uint8ArrayToHex(keyPair.pubRsaKey))
		} else if (keyPair.pubKyberKey && keyPair.pubEccKey) {
			var eccPublicKey = keyPair.pubEccKey
			var kyberPublicKey = bytesToKyberPublicKey(keyPair.pubKyberKey)
			return new PQPublicKeys(eccPublicKey, kyberPublicKey)
		} else {
			throw new Error("Inconsistent Keypair")
		}
	}

	private getPrivateKey(keypair: RsaKeyPair | RsaEccKeyPair): RsaPrivateKey {
		if (this.isRsaEccKeyPair(keypair)) {
			return keypair.privateRsaKey
		} else {
			return keypair.privateKey
		}
	}

	private isRsaEccKeyPair(keypair: RsaEccKeyPair | RsaKeyPair | PQKeyPairs): keypair is RsaEccKeyPair {
		return (keypair as any).privateRsaKey
	}
}

if (!("toJSON" in Error.prototype)) {
	Object.defineProperty(Error.prototype as any, "toJSON", {
		value: function () {
			const alt: Record<string, any> = {}
			for (let key of Object.getOwnPropertyNames(this)) {
				alt[key] = this[key]
			}
			return alt
		},
		configurable: true,
		writable: true,
	})
}

// A key that is encrypted with a given version of some other key.
export type CiphertextKey = {
	encryptingKeyVersion: number
	key: Uint8Array
}

export function encryptKeyWithVersionedKey(encryptingKey: Versioned<AesKey>, key: AesKey): CiphertextKey {
	return {
		encryptingKeyVersion: encryptingKey.version,
		key: encryptKey(encryptingKey.object, key),
	}
}

// Unmapped encrypted owner group instance
type UnmappedOwnerGroupInstance = {
	_ownerEncSessionKey: string
	_ownerKeyVersion: NumberString
	_ownerGroup: Id
}
