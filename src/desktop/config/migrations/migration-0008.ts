import type {Config} from "../ConfigCommon"
import {DesktopNativeCryptoFacade} from "../../DesktopNativeCryptoFacade.js"
import {DesktopKeyStoreFacade} from "../../KeyStoreFacadeImpl.js"
import {DesktopAlarmStorage} from "../../sse/DesktopAlarmStorage.js"
import {Base64, base64ToUint8Array, typedEntries} from "@tutao/tutanota-utils"
import {EncryptedAlarmNotification} from "../../../native/common/EncryptedAlarmNotification.js"

async function createMigration(
	oldConfig: Config,
	crypto: DesktopNativeCryptoFacade,
	keyStore: DesktopKeyStoreFacade,
	alarmStorage: DesktopAlarmStorage
) {
	const deviceKey = await keyStore.getDeviceKey()
	const sessionKeys = oldConfig.pushEncSessionKeys as Record<string, Base64> ?? {}
	const scheduledAlarms = oldConfig.scheduledAlarms as Array<EncryptedAlarmNotification> ?? []

	for (const [id, key] of typedEntries(sessionKeys)) {
		// Alarms and session keys are stored in SQLCipher so we don't need to encrypt them ourselves anymore
		const decryptedKey = crypto.aes256DecryptKey(deviceKey, base64ToUint8Array(key))
		await alarmStorage.storePushIdentifierSessionKey(id, decryptedKey)
	}

	for (const alarm of scheduledAlarms) {
		await alarmStorage.storeAlarm(alarm)
	}

	delete oldConfig.pushEncSessionkeys
	delete oldConfig.scheduledAlarms
	oldConfig.desktopConfigVersion = 8
}

export const migrateClient = createMigration
export const migrateAdmin = createMigration
