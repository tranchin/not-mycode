package de.tutao.tutanota.data

import androidx.room.Entity
import androidx.room.PrimaryKey
import java.util.*

@Entity
data class PushIdentifierKey(
	@field:PrimaryKey val pushIdentifierId: String,
	val deviceEncPushIdentifierKey: ByteArray?
) {
	override fun toString(): String {
		return "PushIdentifierKey{" +
				"pushIdentifierId='" + pushIdentifierId + '\'' +
				", deviceEncPushIdentifierKey=" + deviceEncPushIdentifierKey.contentToString() +
				'}'
	}

	override fun equals(other: Any?): Boolean {
		if (this === other) return true
		if (javaClass != other?.javaClass) return false

		other as PushIdentifierKey

		if (pushIdentifierId != other.pushIdentifierId) return false
		if (!deviceEncPushIdentifierKey.contentEquals(other.deviceEncPushIdentifierKey)) return false

		return true
	}

	override fun hashCode(): Int {
		var result = pushIdentifierId.hashCode()
		result = 31 * result + deviceEncPushIdentifierKey.contentHashCode()
		return result
	}
}