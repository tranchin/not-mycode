package de.tutao.tutanota.offline

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query

@Dao
abstract class EntityDao {
	@Query("SELECT * FROM Entity WHERE typeRef = :typeRef AND listId = :listId AND elementId = :elementId")
	abstract fun load(typeRef: String, listId: String, elementId: String): Entity?

	@Query("SELECT * FROM Entity WHERE typeRef = :typeRef AND listId = :listId AND elementId IN (:elementIds)")
	abstract fun loadMultiple(typeRef: String, listId: String, elementIds: List<String>): List<Entity?>?

	// TODO How does comparison work here when IDs are strings?
	@Query("SELECT * FROM Entity WHERE typeRef = :typeRef AND listId = :listId AND elementId > :startId ORDER BY elementId")
	abstract fun loadRange(typeRef: String, listId: String, startId: String): List<Entity>

	@Query("SELECT * FROM Entity WHERE typeRef = :typeRef AND listId = :listId")
	abstract fun loadAll(typeRef: String, listId: String): List<Entity>

	@Insert(onConflict = OnConflictStrategy.REPLACE)
	abstract fun insert(entities: List<Entity>)

	@Query("DELETE FROM Entity WHERE typeRef = :typeRef AND listId = :listId AND elementId = :elementId")
	abstract fun delete(typeRef: String, listId: String, elementId: String)
}