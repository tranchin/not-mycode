package de.tutao.tutanota.offline

class OfflineRepository(db: OfflineDb) {
	val entities: EntityDao = db.entityDao()

	fun load(typeRef: String, listId: String, elementId: String): Entity? {
		return entities.load(typeRef, listId, elementId)
	}

	fun insert(entity: Entity) {
		entities.insert(listOf(entity))
	}

	fun delete(typeRef: String, listId: String, elementId: String) {
		entities.delete(typeRef, listId, elementId)
	}

}