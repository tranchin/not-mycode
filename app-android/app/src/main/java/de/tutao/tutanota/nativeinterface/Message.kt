package de.tutao.tutanota.nativeinterface

import org.json.JSONArray

sealed class Message(val id: String) {
	class Request(id: String, val type: String, args: JSONArray) : Message(id) {
		override fun toJson(): String {
			TODO("Not yet implemented")
		}

	}
	class RequestResponse(id: String, val value: Any) : Message(id) {
		override fun toJson(): String {
			TODO("Not yet implemented")
		}
	}
	class RequestError(id: String, val error: Any) : Message(id) {
		override fun toJson(): String {
			TODO("Not yet implemented")
		}
	}

	abstract fun toJson(): String
}
