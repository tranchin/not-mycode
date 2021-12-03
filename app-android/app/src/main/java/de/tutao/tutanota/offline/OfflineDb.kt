package de.tutao.tutanota.offline

import android.content.Context
import androidx.room.Database
import androidx.room.RoomDatabase
import de.tutao.tutanota.offline.EntityDao
import de.tutao.tutanota.offline.OfflineDb
import androidx.room.Room

@Database(version = 1, entities = [Entity::class])
abstract class OfflineDb : RoomDatabase() {

	abstract fun entityDao(): EntityDao

	companion object {
		var instance: OfflineDb? = null

		@JvmStatic
		@Synchronized
		fun getInstance(context: Context?): OfflineDb {
			if (instance == null) {
				val builder = Room.databaseBuilder(context!!, OfflineDb::class.java, "offline-db")
				instance = builder.build()
			}
			return instance!!
		}
	}
}