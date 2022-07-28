import {SqlCipher} from "../SqlCipher.js"
import {Aes256Key} from "@tutao/tutanota-crypto/dist/encryption/Aes.js"
import {Base64, mapNullable} from "@tutao/tutanota-utils"
import {EncryptedAlarmNotification} from "../../native/common/EncryptedAlarmNotification.js"
import {log} from "../DesktopLog.js"

const TableDefinitions = {
	session_key: "id TEXT NOT NULL, key BLOB NOT NULL, PRIMARY KEY (id)",
	scheduled_alarm: "identifier TEXT NOT NULL, user_id TEXT NOT NULL, alarm_json TEXT NOT NULL, PRIMARY KEY (identifier)"
}

export class DesktopAlarmStorage {
	private readonly sqlCipher: SqlCipher

	constructor(
		private readonly sqliteNativePath: string
	) {
		this.sqlCipher = new SqlCipher(sqliteNativePath, TableDefinitions)
	}

	init(dbPath: string, databaseKey: Aes256Key, integrityCheck: boolean = true): this {
		this.sqlCipher.init({dbPath, databaseKey, integrityCheck})
		return this
	}

	close() {
		this.sqlCipher.close()
	}

	async storePushIdentifierSessionKey(id: string, key: Uint8Array) {
		this.sqlCipher.run("INSERT OR IGNORE INTO session_key VALUES (:id, :key)", {id, key})
	}

	async removePushIdentifierKeys() {
		this.sqlCipher.run("DELETE * FROM session_key")
	}

	async removePushIdentifierKey(pushId: string) {
		log.debug("Remove push identifier key. elementId=" + pushId)
		this.sqlCipher.run("DELETE FROM session_key WHERE id = :pushId", {pushId})
	}

	/**
	 * try to get a B64 encoded PushIdentifierSessionKey that can decrypt a notificationSessionKey from memory or decrypt it from disk storage
	 * @return {Promise<?Base64>} a stored pushIdentifierSessionKey that should be able to decrypt the given notificationSessionKey
	 */
	async getPushIdentifierSessionKey(sessionKeyId: string): Promise<Uint8Array | null> {
		return mapNullable(
			this.sqlCipher.get(
				"SELECT key FROM session_key WHERE id = :id", {id: sessionKeyId}),
			(row) => new Uint8Array(row.key.buffer)
		)
	}

	async storeAlarm(alarm: EncryptedAlarmNotification) {
		this.sqlCipher.run(
			"INSERT OR REPLACE INTO scheduled_alarm VALUES (:identifier, :user_id, :alarm_json)",
			{
				identifier: alarm.alarmInfo.alarmIdentifier,
				user_id: alarm.user,
				alarm_json: JSON.stringify(alarm)
			}
		)
	}

	async deleteAlarm(identifier: string) {
		this.sqlCipher.run("DELETE FROM scheduled_alarm WHERE identifier = :identifier", {identifier})
	}

	async deleteAllAlarms() {
		this.sqlCipher.run("DELETE FROM scheduled_alarm")
	}

	async deleteAllAlarmsForUser(userId: Id) {
		this.sqlCipher.run("DELETE FROM scheduled_alarm WHERE user_id = :userId", {userId})
	}

	async getScheduledAlarms(): Promise<Array<EncryptedAlarmNotification>> {
		return this.sqlCipher.all("SELECT alarm_json FROM scheduled_alarm")
				   .map(row => JSON.parse(row.alarm_json))
	}
}