package de.tutao.tutanota.data

import de.tutao.tutanota.alarms.AlarmNotification
import androidx.room.*

@Dao
interface AlarmInfoDao {
	@Insert(onConflict = OnConflictStrategy.REPLACE)
	fun insertAlarmNotification(alarmNotification: AlarmNotification?)

	@get:Query("SELECT * FROM AlarmNotification")
	val alarmNotifications: List<AlarmNotification?>?

	@Query("DELETE FROM AlarmNotification WHERE identifier = :identifier")
	fun deleteAlarmNotification(identifier: String?)

	@Query("DELETE FROM AlarmNotification")
	fun clear()
}