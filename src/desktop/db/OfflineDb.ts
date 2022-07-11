import {firstBiggerThanSecond} from "../../api/common/utils/EntityUtils"
import {OfflineDbMeta} from "../../api/worker/offline/OfflineStorage.js"
import {SqlCipher} from "../SqlCipher.js"

export interface PersistedEntity {
	type: string,
	listId: Id | null,
	elementId: Id,
	entity: Uint8Array,
}

const TableDefinitions = Object.freeze({
	list_entities: "type TEXT NOT NULL, listId TEXT NOT NULL, elementId TEXT NOT NULL, entity BLOB NOT NULL, PRIMARY KEY (type, listId, elementId)",
	element_entities: "type TEXT NOT NULL, elementId TEXT NOT NULL, entity BLOB NOT NULL, PRIMARY KEY (type, elementId)",
	ranges: "type TEXT NOT NULL, listId TEXT NOT NULL, lower TEXT NOT NULL, upper TEXT NOT NULL, PRIMARY KEY (type, listId)",
	lastUpdateBatchIdPerGroupId: "groupId TEXT NOT NULL, batchId TEXT NOT NULL, PRIMARY KEY (groupId)",
	metadata: "key TEXT NOT NULL, value BLOB, PRIMARY KEY (key)",
} as const)

/**
 * Wrapper around SQLite database. Used to cache entities for offline.
 */
export class OfflineDb {
	private sqlCipher: SqlCipher

	constructor(
		private readonly nativeBindingPath: string
	) {
		this.sqlCipher = new SqlCipher(nativeBindingPath, TableDefinitions)
	}

	init(dbPath: string, databaseKey: Aes256Key, integrityCheck: boolean = true) {
		this.sqlCipher.init({dbPath, databaseKey, integrityCheck})

		// Register user-defined functions for comparing ids because we need to compare length first and lexicographically second
		this.sqlCipher.function("firstIdBigger", (l, r) => {
			return boolToSqlite(firstBiggerThanSecond(l, r))
		})
		this.sqlCipher.function("firstIdBiggerOrEq", (l, r) => {
			return boolToSqlite(l == r || firstBiggerThanSecond(l, r))
		})
	}

	purge() {
		this.sqlCipher.purge()
	}

	close() {
		this.sqlCipher.close()
	}

	put({type, listId, elementId, entity}: PersistedEntity) {
		if (listId == null) {
			this.sqlCipher.run("INSERT OR REPLACE INTO element_entities VALUES (:type,:elementId,:entity)", {type, elementId, entity})
		} else {
			this.sqlCipher.run("INSERT OR REPLACE INTO list_entities VALUES (:type,:listId,:elementId,:entity)", {type, listId, elementId, entity})
		}
	}

	setNewRange(type: string, listId: Id, lower: Id, upper: Id) {
		this.sqlCipher.run("INSERT OR REPLACE INTO ranges VALUES (:type,:listId,:lower,:upper)", {type, listId, lower, upper})
	}

	setUpperRange(type: string, listId: Id, upper: Id) {
		const {changes} = this.sqlCipher.run("UPDATE ranges SET upper = :upper WHERE type = :type AND listId = :listId", {upper, type, listId})
		if (changes != 1) {
			throw new Error("Did not update row")
		}
	}

	setLowerRange(type: string, listId: Id, lower: Id) {
		const {changes} = this.sqlCipher.run("UPDATE ranges SET lower = :lower WHERE type = :type AND listId = :listId", {lower, type, listId})
		if (changes != 1) {
			throw new Error("Did not update row")
		}
	}

	getRange(type: string, listId: Id): {lower: string, upper: string} | null {
		return this.sqlCipher.get("SELECT upper, lower FROM ranges WHERE type = :type AND listId = :listId", {type, listId}) ?? null
	}

	getIdsInRange(type: string, listId: Id): Array<Id> {
		const range = this.getRange(type, listId)
		if (range == null) {
			throw new Error(`no range exists for ${type} and list ${listId}`)
		}
		const {lower, upper} = range
		return this.sqlCipher.all(
			"SELECT elementId FROM list_entities WHERE type = :type AND listId = :listId AND firstIdBiggerOrEq(elementId, :lower) AND NOT(firstIdBigger(elementId, :upper))",
			{type, listId, lower, upper}
		).map((row) => row.elementId)
	}

	//start is not included in range queries
	provideFromRange(type: string, listId: Id, start: Id, count: number, reverse: boolean): Buffer[] {
		if (reverse) {
			return this.sqlCipher.all(
				"SELECT entity FROM list_entities WHERE type = :type AND listId = :listId AND firstIdBigger(:start, elementId) ORDER BY LENGTH(elementId) DESC, elementId DESC LIMIT :count",
				{type, listId, start, count}
			).map((row) => row.entity)
		} else {
			return this.sqlCipher.all(
				"SELECT entity FROM list_entities WHERE type = :type AND listId = :listId AND firstIdBigger(elementId, :start) ORDER BY LENGTH(elementId) ASC, elementId ASC LIMIT :count",
				{type, listId, start, count}
			).map((row) => row.entity)
		}
	}

	get(type: string, listId: string | null, elementId: string): Buffer | null {
		let result
		if (listId == null) {
			result = this.sqlCipher.get("SELECT entity from element_entities WHERE type = :type AND elementId = :elementId", {type, elementId})
		} else {
			result = this.sqlCipher.get(
				"SELECT entity from list_entities WHERE type = :type AND listId = :listId AND elementId = :elementId",
				{type, listId, elementId}
			)
		}

		return result?.entity ?? null
	}

	getListElementsOfType(type: string): Array<Uint8Array> {
		return this.sqlCipher.all("SELECT entity from list_entities WHERE type = :type", {type})
				   ?.map(row => new Uint8Array(row.entity.buffer))
			?? []
	}

	getWholeList(type: string, listId: Id): Array<Uint8Array> {
		return this.sqlCipher.all("SELECT entity FROM list_entities WHERE type = :type AND listId = :listId", {type, listId})
				   .map(row => row.entity)
	}

	delete(type: string, listId: string | null, elementId: string) {
		if (listId == null) {
			this.sqlCipher.run("DELETE FROM element_entities WHERE type = :type AND elementId = :elementId", {type, elementId})
		} else {
			this.sqlCipher.run(
				"DELETE FROM list_entities WHERE type = :type AND listId = :listId AND elementId = :elementId",
				{type, listId, elementId}
			)
		}
	}

	getLastBatchIdForGroup(groupId: Id): Id | null {
		return this.sqlCipher.get("SELECT batchId from lastUpdateBatchIdPerGroupId WHERE groupId = :groupId ", {groupId})?.batchId ?? null
	}

	putLastBatchIdForGroup(groupId: Id, batchId: Id) {
		this.sqlCipher.run("INSERT OR REPLACE INTO lastUpdateBatchIdPerGroupId VALUES (:groupId,:batchId)", {groupId, batchId})
	}

	getMetadata<K extends keyof OfflineDbMeta>(key: K): Uint8Array | null {
		const value: Buffer | null = this.sqlCipher.get("SELECT value from metadata WHERE key = :key ", {key})?.value ?? null

		if (value) {
			return new Uint8Array(value.buffer)
		} else {
			return null
		}
	}

	putMetadata<K extends keyof OfflineDbMeta>(key: K, value: Uint8Array) {
		this.sqlCipher.run("INSERT OR REPLACE INTO metadata VALUES (:key,:value)", {key, value})
	}

	deleteList(type: string, listId: Id) {
		this.sqlCipher.transaction(() => {
			this.sqlCipher.run("DELETE FROM list_entities WHERE type = :type AND listId = :listId", {type, listId})
			this.deleteRange(type, listId)
		})
	}

	deleteRange(type: string, listId: string) {
		this.sqlCipher.run("DELETE FROM ranges WHERE type = :type AND listId = :listId", {type, listId})
	}

	compactDatabase() {
		this.sqlCipher.exec("VACUUM")
	}

	printDatabaseInfo() {
		console.log("sqlcipher version: ", this.sqlCipher.pragma("cipher_version"))
		console.log("sqlcipher configuration: ", this.sqlCipher.pragma("cipher_settings"))
		console.log("cipher provider: ", this.sqlCipher.pragma("cipher_provider"))
		console.log("cipher provider version: ", this.sqlCipher.pragma("cipher_provider_version"))
	}

	deleteIn(type: string, listId: Id | null, elementIds: Id[]) {
		const elementIdsPlaceholder = elementIds.map(() => '?').join(",")
		const query = listId == null
			? `DELETE FROM element_entities WHERE type = :type AND elementId IN (${elementIdsPlaceholder})`
			: `DELETE FROM list_entities WHERE type = :type AND listId = :listId AND elementId IN (${elementIdsPlaceholder})`

		this.sqlCipher.run(query, elementIds, {type, listId})
	}

	dumpMetadata(): Array<[string, Uint8Array]> {
		return this.sqlCipher.all("SELECT * from metadata").map(row => [row.key, new Uint8Array(row.value.buffer)])
	}
}

enum SqliteBool {
	TRUE = 1,
	FALSE = 0,
}

function boolToSqlite(bool: boolean): SqliteBool {
	return bool ? SqliteBool.TRUE : SqliteBool.FALSE
}