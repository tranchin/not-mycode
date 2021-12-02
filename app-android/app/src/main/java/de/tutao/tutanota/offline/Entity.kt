package de.tutao.tutanota.offline

import java.util.*

@androidx.room.Entity(primaryKeys = ["listId", "elementId", "typeRef"])
class Entity(typeRef: String, listId: String, elementId: String, data: String) {
	@JvmField
	var typeRef = ""
	@JvmField
	var listId = ""
	@JvmField
	var elementId = ""
	@JvmField
	var data = ""
	override fun equals(o: Any?): Boolean {
		if (this === o) return true
		if (o == null || javaClass != o.javaClass) return false
		val entity = o as Entity
		return typeRef == entity.typeRef && listId == entity.listId && elementId == entity.elementId && data == entity.data
	}

	override fun hashCode(): Int {
		return Objects.hash(typeRef, listId, elementId, data)
	}

	companion object {
		const val NO_LIST_ID = ""
	}

	init {
		this.typeRef = typeRef
		this.listId = listId
		this.elementId = elementId
		this.data = data
	}
}