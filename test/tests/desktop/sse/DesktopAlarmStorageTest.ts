import o from "ospec"
import {object} from "testdouble"
import {DesktopAlarmStorage} from "../../../../src/desktop/sse/DesktopAlarmStorage.js"
import {SqlCipher} from "../../../../src/desktop/SqlCipher.js"
import {uint8ArrayToKey} from "@tutao/tutanota-crypto"
import {EncryptedAlarmNotification} from "../../../../src/native/common/EncryptedAlarmNotification.js"
import {OperationType} from "../../../../src/api/common/TutanotaConstants.js"
import {mapNullable} from "@tutao/tutanota-utils"

o.spec("DesktopAlarmStorageTest", function () {

	let sqlCipherMock: SqlCipher
	let desktopStorage: DesktopAlarmStorage

	const sessionKeyId1 = "keyId1"
	const sessionKeyId2 = "keyId2"
	const sessionKey1 = new Uint8Array([1])
	const sessionKey2 = new Uint8Array([2])

	const userId1 = "userId1"
	const userId2 = "userId2"
	const alarmIdentifier1 = "alarmIdentifier1"
	const alarmIdentifier2 = "alarmIdentifier2"
	const alarmIdentifier3 = "alarmIdentifier3"
	const alarmIdentifier4 = "alarmIdentifier4"
	const alarm1 = makeAlarm(userId1, alarmIdentifier1)
	const alarm2 = makeAlarm(userId1, alarmIdentifier2)
	const alarm3 = makeAlarm(userId2, alarmIdentifier3)
	const alarm4 = makeAlarm(userId2, alarmIdentifier4)

	o.beforeEach(async function () {
		sqlCipherMock = object<SqlCipher>()
		desktopStorage = new DesktopAlarmStorage(buildOptions.sqliteNativePath).init(":memory:", uint8ArrayToKey(new Uint8Array([0, 1, 2, 3])), false)
	})

	o.spec("session keys", function () {
		o.beforeEach(async function () {
			await desktopStorage.storePushIdentifierSessionKey(sessionKeyId1, sessionKey1)
			await desktopStorage.storePushIdentifierSessionKey(sessionKeyId2, sessionKey2)
		})

		o("should return stored keys", async function () {
			await assertStoredKey(sessionKeyId1, sessionKey1)
			await assertStoredKey(sessionKeyId2, sessionKey2)
		})

		o("should return null for keys that were never stored", async function () {
			await assertStoredKey("nonexistentSessionKeyId", null)
		})

		o("should not return keys that were removed", async function () {
			await desktopStorage.removePushIdentifierKey(sessionKeyId1)
			await assertStoredKey(sessionKeyId1, null)
			await assertStoredKey(sessionKeyId2, sessionKey2)
		})

		o("should not return any keys", async function () {
			await desktopStorage.removePushIdentifierKey(sessionKeyId1)
			await desktopStorage.removePushIdentifierKey(sessionKeyId2)
			await assertStoredKey(sessionKeyId1, null)
			await assertStoredKey(sessionKeyId2, null)
		})

		o("should not overwrite existing stored session key", async function () {
			await desktopStorage.storePushIdentifierSessionKey(sessionKeyId1, sessionKey2)
			await assertStoredKey(sessionKeyId1, sessionKey1)
		})

		async function assertStoredKey(id: string, expected: Uint8Array | null) {
			const actual = mapNullable(await desktopStorage.getPushIdentifierSessionKey(id), Array.from)
			if (expected) {
				o(actual).deepEquals(Array.from(expected))
			} else {
				o(actual).equals(null)
			}
		}
	})

	o.spec("alarms", function () {
		o.beforeEach(async function () {
			await desktopStorage.storeAlarm(alarm1)
			await desktopStorage.storeAlarm(alarm2)
			await desktopStorage.storeAlarm(alarm3)
			await desktopStorage.storeAlarm(alarm4)
		})

		o("should return all stored alarms", async function () {
			o(await desktopStorage.getScheduledAlarms()).deepEquals([
				alarm1, alarm2, alarm3, alarm4
			])
		})

		o("should not return deleted alarms", async function () {
			await desktopStorage.deleteAlarm(alarmIdentifier1)
			await desktopStorage.deleteAlarm(alarmIdentifier3)
			o(await desktopStorage.getScheduledAlarms()).deepEquals([
				alarm2, alarm4
			])
		})

		o("should return no alarms", async function () {
			await desktopStorage.deleteAllAlarms()
			o(await desktopStorage.getScheduledAlarms()).deepEquals([])
		})

		o("should return no alarms for the specific user", async function () {
			await desktopStorage.deleteAllAlarmsForUser(userId1)
			o(await desktopStorage.getScheduledAlarms()).deepEquals([
				alarm3, alarm4
			])
		})
	})
})

function makeAlarm(userId, alarmIdentifier): EncryptedAlarmNotification {
	return {
		operation: OperationType.CREATE,
		notificationSessionKeys: [],
		alarmInfo: {alarmIdentifier},
		user: userId
	}
}
