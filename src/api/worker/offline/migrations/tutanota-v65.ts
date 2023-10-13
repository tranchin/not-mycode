import { OfflineMigration } from "../OfflineStorageMigrator.js"
import { OfflineStorage } from "../OfflineStorage.js"
import { migrateAllElements } from "../StandardMigrations.js"
import { CalendarGroupRootTypeRef } from "../../../entities/tutanota/TypeRefs.js"

export const tutanota65: OfflineMigration = {
	app: "tutanota",
	version: 65,
	async migrate(storage: OfflineStorage) {
		// We have fully removed FileData
		migrateAllElements(CalendarGroupRootTypeRef, storage, [])
	},
}
