import {OfflineMigration} from "../OfflineStorageMigrator.js"
import {OfflineStorage} from "../OfflineStorage.js"
import {migrateAllElements} from "../StandardMigrations.js"
import {createCustomerProperties, CustomerPropertiesTypeRef} from "../../../entities/sys/TypeRefs.js"

export const sys79: OfflineMigration = {
	app: "sys",
	version: 79,
	async migrate(storage: OfflineStorage) {
		await migrateAllElements(CustomerPropertiesTypeRef, storage, [
			createCustomerProperties
		])
	}
}
