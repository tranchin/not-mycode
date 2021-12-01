package de.tutao.tutanota.offline;

import androidx.annotation.NonNull;

@androidx.room.Entity(
		primaryKeys = {
				"listId", "elementId", "typeRef"
		}
)
public class Entity {

	/**
	 * List id of the entity. An empty string means it's not a list element
	 */
	@NonNull
	public String listId = "";

	@NonNull
	public String elementId = "";

	@NonNull
	public String typeRef = "";


	public String entityJson;
}
