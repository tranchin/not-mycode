package de.tutao.tutanota.offline;

import static androidx.room.OnConflictStrategy.ABORT;
import static androidx.room.OnConflictStrategy.REPLACE;

import androidx.annotation.Nullable;
import androidx.lifecycle.LiveData;
import androidx.room.Dao;
import androidx.room.Insert;
import androidx.room.OnConflictStrategy;
import androidx.room.Query;
import androidx.room.Transaction;

import java.util.List;

import de.tutao.tutanota.data.PushIdentifierKey;
import de.tutao.tutanota.data.User;

@Dao
public abstract class EntityDao {

	@Query("SELECT * FROM Entity WHERE typeRef = :typeRef AND listId = :listId AND elementId = :elementId")
	public abstract Entity load(String typeRef, @Nullable String listId, String elementId);

	@Query("SELECT * FROM Entity WHERE typeRef = :typeRef AND listId = :listId AND elementId IN (:elementIds)")
	public abstract List<Entity> loadMultiple(String typeRef, @Nullable String listId, List<String> elementIds);

	// TODO How does comparison work here when IDs are strings?
//	@Query("SELECT * FROM Entity WHERE typeRef = :typeRef AND listId = :listId AND elementId > :startId ORDER BY elementId")
//	public abstract List<Entity> loadRange(String typeRef, String listId, String startId);

	@Query("SELECT * FROM Entity WHERE typeRef = :typeRef AND listId = :listId")
	public abstract List<Entity> loadAll(String typeRef, String listId);

	@Insert(onConflict = REPLACE)
	public abstract void insert(List<Entity> entities);

	@Query("DELETE FROM Entity WHERE typeRef = :typeRef AND listId = :listId AND elementId = :elementId")
	public abstract void delete(String listId, String elementId, String typeRef);
}
