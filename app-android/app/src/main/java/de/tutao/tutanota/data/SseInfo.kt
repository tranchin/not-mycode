package de.tutao.tutanota.data

import android.text.TextUtils
import android.util.Log
import androidx.room.Entity
import androidx.room.PrimaryKey
import androidx.room.TypeConverter
import androidx.room.TypeConverters
import org.json.JSONException
import org.json.JSONObject
import java.util.*

private class UserIdsConverter {
	@TypeConverter
	fun userIdsToString(ids: List<String>): String {
		return TextUtils.join(",", ids)
	}

	@TypeConverter
	fun stringToIds(string: String): List<String> {
		return Arrays.asList(*string.split(",").toTypedArray())
	}
}

@Entity
@TypeConverters(UserIdsConverter::class)
data class SseInfo(
	@field:PrimaryKey val pushIdentifier: String,
	val userIds: Collection<String>,
	val sseOrigin: String
) {

	override fun toString(): String {
		return "SseInfo{" +
				"pushIdentifier='" + pushIdentifier + '\'' +
				", userIds=" + userIds +
				", sseOrigin='" + sseOrigin + '\'' +
				'}'
	}

	companion object {
		private const val PUSH_IDENTIFIER_JSON_KEY = "pushIdentifier"
		private const val USER_IDS_JSON_KEY = "userIds"
		private const val SSE_ORIGIN_JSON_KEY = "sseOrigin"
		fun fromJson(json: String): SseInfo? {
			return try {
				val jsonObject = JSONObject(json)
				val identifier = jsonObject.getString(PUSH_IDENTIFIER_JSON_KEY)
				val userIdsArray = jsonObject.getJSONArray(USER_IDS_JSON_KEY)
				val userIds: MutableList<String> = ArrayList(userIdsArray.length())
				for (i in 0 until userIdsArray.length()) {
					userIds.add(userIdsArray.getString(i))
				}
				val sseOrigin = jsonObject.getString(SSE_ORIGIN_JSON_KEY)
				SseInfo(identifier, userIds, sseOrigin)
			} catch (e: JSONException) {
				Log.w("SseInfo", "could read sse info", e)
				null
			}
		}
	}
}