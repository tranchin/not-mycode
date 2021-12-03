package de.tutao.tutanota

import de.tutao.tutanota.alarms.AlarmNotificationsManager
import de.tutao.tutanota.nativeinterface.Native
import de.tutao.tutanota.offline.Entity
import de.tutao.tutanota.offline.OfflineRepository
import de.tutao.tutanota.push.SseStorage
import org.json.JSONArray
import org.json.JSONObject
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.mockito.ArgumentMatchers
import org.mockito.Mockito
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
//
//@RunWith(RobolectricTestRunner::class)
//@Config(manifest = Config.NONE)
//class NativeTest {
//	lateinit var activity: MainActivity
//	lateinit var sseStorage: SseStorage
//	lateinit var alarmNotificationsManager: AlarmNotificationsManager
//	lateinit var offlineRepo: OfflineRepository
//
//	lateinit var native: Native
//
//	@Before
//	fun setup() {
//		activity = Mockito.mock(MainActivity::class.java)
//		sseStorage = Mockito.mock(SseStorage::class.java)
//		alarmNotificationsManager = Mockito.mock(AlarmNotificationsManager::class.java)
//		offlineRepo = Mockito.mock(OfflineRepository::class.java)
//		native = Native(activity, sseStorage, alarmNotificationsManager, offlineRepo)
//	}
//
//	private fun createRequestJson(
//		app: String,
//		type: String,
//		elementId: String,
//		listId: String?,
//		payload: String?
//	): JSONObject {
//		val typeRef = JSONObject()
//		typeRef.put("app", app)
//		typeRef.put("type", type)
//
//		val query = JSONObject()
//		query.put("typeRef", typeRef)
//		query.put("elementId", elementId)
//		listId?.let { query.put("listId", it) }
//		payload?.let { query.put("payload", it) }
//
//		return query
//	}
//
//	@Test
//	fun offlineLoadShouldLoadNonListElement() = testAsync {
//		val query = JSONObject()
//		query.put("typeRef", "app/type")
//		query.put("elementId", "someElementId")
//		val queryArr = JSONArray()
//		queryArr.put(query)
//		val args = JSONArray()
//		args.put(queryArr)
//		native.invokeMethod("offline.load", args)
//		Mockito.verify(offlineRepo).load("app/type", Entity.NO_LIST_ID, "someElementId")
//	}
//
//	@Test
//	fun offlineLoadShouldLoadListElement() = testAsync {
//		val query = JSONObject()
//		query.put("typeRef", "app/type")
//		query.put("listId", "someListId")
//		query.put("elementId", "someElementId")
//		val args = JSONArray()
//		args.put(query)
//		native.invokeMethod("offline.load", args)
//		Mockito.verify(offlineRepo).load("app/type", "someListId", "someElementId")
//	}
//
//	@Test
//	fun offlineWriteShouldLoadNonListElement() = testAsync {
//		val query = JSONObject()
//		query.put("typeRef", "app/type")
//		query.put("elementId", "someElementId")
//		query.put("payload", "theSerializedEntity")
//		val queryArr = JSONArray()
//		queryArr.put(query)
//		val args = JSONArray()
//		args.put(queryArr)
//		native.invokeMethod("offline.load", args)
//		Mockito.verify(offlineRepo)
//			.insert(ArgumentMatchers.eq(Entity("app/type", Entity.NO_LIST_ID, "sommeElementId", "theSerializedEntity")))
//	}
//
//	@Test
//	fun offlineWriteShouldWriteListElement() = testAsync {
//		val query = JSONObject()
//		query.put("typeRef", "app/type")
//		query.put("listId", "someListId")
//		query.put("elementId", "someElementId")
//		query.put("payload", "theSerializedEntity")
//		val args = JSONArray()
//		args.put(query)
//		native.invokeMethod("offline.load", args)
//		Mockito.verify(offlineRepo)
//			.insert(ArgumentMatchers.eq(Entity("app/type", "someListId", "sommeElementId", "theSerializedEntity")))
//	}
//
//	@Test
//	fun offlineLoadShouldWriteNonListElement() = testAsync {
//		val query = JSONObject()
//		query.put("typeRef", "app/type")
//		query.put("elementId", "someElementId")
//		val queryArr = JSONArray()
//		queryArr.put(query)
//		val args = JSONArray()
//		args.put(queryArr)
//		native.invokeMethod("offline.load", args)
//		Mockito.verify(offlineRepo).load("app/type", Entity.NO_LIST_ID, "someElementId")
//	}
//
//	@Test
//	fun offlineWriteShouldFailWhenNoBody() = testAsync {
//		val query = JSONObject()
//		query.put("typeRef", "app/type")
//		query.put("listId", "someListId")
//		query.put("elementId", "someElementId")
//		val args = JSONArray()
//		args.put(query)
//		native.invokeMethod("offline.load", args)
//		Mockito.verify(offlineRepo).load("app/type", "someListId", "someElementId")
//	}
//}
//
