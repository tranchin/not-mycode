package de.tutao.tutanota.offline

@androidx.room.Entity(primaryKeys = ["listId", "elementId", "typeRef"])
data class Entity(
	val typeRef: String,
	val listId: String,
	val elementId: String,
	val data: String
) {
	companion object {
		const val NO_LIST_ID = ""
	}
}