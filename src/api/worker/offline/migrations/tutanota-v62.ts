import { OfflineMigration } from "../OfflineStorageMigrator.js"
import { OfflineStorage } from "../OfflineStorage.js"
import { CalendarEventTypeRef } from "../../../entities/tutanota/TypeRefs.js"
import { deleteInstancesOfType } from "../StandardMigrations.js"

export const tutanota62: OfflineMigration = {
	app: "tutanota",
	version: 62,
	async migrate(storage: OfflineStorage) {},
}
