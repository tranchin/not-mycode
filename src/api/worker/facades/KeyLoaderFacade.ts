import { EntityClient } from "../../common/EntityClient.js"
import { AesKey, AsymmetricKeyPair, decryptKey, decryptKeyPair, isPqKeyPairs, PQKeyPairs, RsaEccKeyPair, RsaKeyPair } from "@tutao/tutanota-crypto"
import { Group, GroupKey, GroupKeyTypeRef, GroupTypeRef } from "../../entities/sys/TypeRefs.js"
import { Versioned } from "@tutao/tutanota-utils/dist/Utils.js"
import { UserFacade } from "./UserFacade.js"
import { assertNotNull } from "@tutao/tutanota-utils"
import { NotFoundError } from "../../common/error/RestError.js"
import { getElementId } from "../../common/utils/EntityUtils.js"

export class KeyLoaderFacade {
	constructor(private readonly userFacade: UserFacade, private readonly entityClient: EntityClient) {}

	async loadSymGroupKey(groupId: Id, version: number): Promise<AesKey> {
		const group = await this.entityClient.load(GroupTypeRef, groupId)
		const groupKey = this.userFacade.getGroupKey(group._id)

		if (groupKey.version === version) {
			return groupKey.object
		}
		const { symmetricGroupKey } = await this.findFormerGroupKey(group, groupKey, version)

		return symmetricGroupKey
	}

	async loadKeypair(keyPairGroupId: Id, groupKeyVersion: number): Promise<AsymmetricKeyPair> {
		const group = await this.entityClient.load(GroupTypeRef, keyPairGroupId)
		const groupKey = this.userFacade.getGroupKey(group._id)

		if (groupKey.version === groupKeyVersion) {
			return this.getAndDecryptKeyPair(group, groupKey.object)
		}
		let { symmetricGroupKey, groupKeyInstance } = await this.findFormerGroupKey(group, groupKey, groupKeyVersion)

		try {
			return decryptKeyPair(symmetricGroupKey, groupKeyInstance.keyPair)
		} catch (e) {
			console.log("failed to decrypt keypair for group with id " + group._id)
			throw e
		}
	}

	async loadCurrentKeyPair(groupId: Id): Promise<Versioned<RsaKeyPair | RsaEccKeyPair | PQKeyPairs>> {
		const group = await this.entityClient.load(GroupTypeRef, groupId)
		const groupKey = this.userFacade.getGroupKey(group._id)

		const result = this.getAndDecryptKeyPair(group, groupKey.object)
		if (isPqKeyPairs(result)) {
			return { object: result, version: Number(group.groupKeyVersion) }
		} else {
			return { object: result, version: 0 }
		}
	}

	private async findFormerGroupKey(
		group: Group,
		currentGroupKey: Versioned<AesKey>,
		targetKeyVersion: number,
	): Promise<{ symmetricGroupKey: AesKey; groupKeyInstance: GroupKey }> {
		const formerKeysList = assertNotNull(group.formerGroupKeys, "no former group keys").list
		const formerKeys: GroupKey[] = await this.entityClient.loadAll(GroupKeyTypeRef, formerKeysList) // nothing good can come from this...

		let lastVersion = currentGroupKey.version
		let lastOwnerGroupKey = currentGroupKey.object
		let lastGroupKey: GroupKey | null = null

		for (const encryptedKey of formerKeys.reverse()) {
			const version = this.decodeGroupKeyVersion(getElementId(encryptedKey))
			if (version + 1 > lastVersion) {
				continue
			} else if (version + 1 === lastVersion) {
				lastOwnerGroupKey = decryptKey(lastOwnerGroupKey, encryptedKey.ownerEncGKey)
				lastVersion = version
				lastGroupKey = encryptedKey
				if (lastVersion <= targetKeyVersion) {
					break
				}
			} else {
				throw new Error(`unexpected version ${version}; expected ${lastVersion}`)
			}
		}

		if (lastVersion !== targetKeyVersion || !lastGroupKey) {
			throw new Error(`could not get version (last version is ${lastVersion} of ${formerKeys.length} key(s) loaded from list ${formerKeysList})`)
		}

		return { symmetricGroupKey: lastOwnerGroupKey, groupKeyInstance: lastGroupKey }
	}

	private decodeGroupKeyVersion(id: Id): number {
		// FIXME determine how we encode versions as element IDs for former group keys?
		return Number(id)
	}

	private getAndDecryptKeyPair(group: Group, groupKey: AesKey) {
		if (group.currentKeys == null) {
			throw new NotFoundError(`no key pair on group ${group._id}`)
		}
		return decryptKeyPair(groupKey, group.currentKeys)
	}
}
