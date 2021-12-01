package de.tutao.tutanota.offline;

import java.util.Arrays;
import java.util.Collections;
import java.util.List;

public class OfflineRepository {
	EntityDao entities;

	public OfflineRepository(OfflineDb db) {
		this.entities = db.entityDao();
	}

	public Entity loadSingle(String typeRef, String listId, String elementId) {
		if (listId.equals("")) {
			throw new RuntimeException("List id not provided");
		}
		return this.entities.load(typeRef, listId, elementId);
	}

	public Entity loadSingle(String typeRef, String elementId) {
		return this.entities.load(typeRef, "", elementId);
	}

	public void create(Entity entity) {
		this.entities.insert(Collections.singletonList(entity));
	}

	public void create(List<Entity> entities) {
		this.entities.insert(entities);
	}
}
