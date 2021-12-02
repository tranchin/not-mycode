package de.tutao.tutanota.offline;

import android.content.Context;

import androidx.room.Database;
import androidx.room.Room;
import androidx.room.RoomDatabase;

@Database(version = 1, entities = {Entity.class})
public abstract class OfflineDb extends RoomDatabase {
	static OfflineDb instance = null;

	public static OfflineDb getInstance(Context context) {
		if (instance == null) {
			Builder<OfflineDb> builder = Room.databaseBuilder(context, OfflineDb.class, "offline-db");
			instance = builder.build();
		}

		return instance;
	}

	public abstract EntityDao entityDao();
}
