package de.tutao.tutanota;

import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;

import static de.tutao.tutanota.offline.Entity.NO_LIST_ID;

import androidx.annotation.Nullable;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;
import org.junit.Before;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.mockito.ArgumentMatchers;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.annotation.Config;

import de.tutao.tutanota.alarms.AlarmNotificationsManager;
import de.tutao.tutanota.offline.Entity;
import de.tutao.tutanota.offline.OfflineRepository;
import de.tutao.tutanota.push.SseStorage;

@RunWith(RobolectricTestRunner.class)
@Config(manifest = Config.NONE)
public class NativeTest {
	MainActivity activity;
	SseStorage sseStorage;
	AlarmNotificationsManager alarmNotificationsManager;
	OfflineRepository offlineRepo;
	Native myNative; // apparently `native` is a keyword

	@Before
	public void setup() {
		activity = mock(MainActivity.class);
		sseStorage = mock(SseStorage.class);
		alarmNotificationsManager = mock(AlarmNotificationsManager.class);
		offlineRepo = mock(OfflineRepository.class);

		myNative = new Native(activity, sseStorage, alarmNotificationsManager, offlineRepo);
	}

	private JSONObject createRequestJson(String app, String type, String elementId, @Nullable String listId, @Nullable String payload) throws JSONException {
		JSONObject typeRef = new JSONObject();
		typeRef.put("app", app);
		typeRef.put("type", type);

		JSONObject query = new JSONObject();
		query.put("typeRef", typeRef);
		query.put("elementId", elementId);

		if (listId != null) {

		}
	}

	@Test
	public void offlineLoadShouldLoadNonListElement() throws JSONException {

		JSONObject query = new JSONObject();
		query.put("typeRef", "app/type");
		query.put("elementId", "someElementId");

		JSONArray queryArr = new JSONArray();
		queryArr.put(query);

		JSONArray args = new JSONArray();
		args.put(queryArr);
		myNative.invokeMethod("offline.load", args);

		verify(offlineRepo).load("app/type", NO_LIST_ID, "someElementId");
	}

	@Test
	public void offlineLoadShouldLoadListElement() throws JSONException {

		JSONObject query = new JSONObject();
		query.put("typeRef", "app/type");
		query.put("listId", "someListId");
		query.put("elementId", "someElementId");

		JSONArray args = new JSONArray();
		args.put(query);
		myNative.invokeMethod("offline.load", args);

		verify(offlineRepo).load("app/type", "someListId", "someElementId");
	}

	@Test
	public void offlineWriteShouldLoadNonListElement() throws JSONException {

		JSONObject query = new JSONObject();
		query.put("typeRef", "app/type");
		query.put("elementId", "someElementId");
		query.put("payload", "theSerializedEntity");

		JSONArray queryArr = new JSONArray();
		queryArr.put(query);

		JSONArray args = new JSONArray();
		args.put(queryArr);
		myNative.invokeMethod("offline.load", args);

		verify(offlineRepo).insert(eq(new Entity("app/type", NO_LIST_ID, "sommeElementId", "theSerializedEntity")));
	}

	@Test
	public void offlineWriteShouldWriteListElement() throws JSONException {

		JSONObject query = new JSONObject();
		query.put("typeRef", "app/type");
		query.put("listId", "someListId");
		query.put("elementId", "someElementId");
		query.put("payload", "theSerializedEntity");

		JSONArray args = new JSONArray();
		args.put(query);
		myNative.invokeMethod("offline.load", args);

		verify(offlineRepo).insert(eq(new Entity("app/type", "someListId", "sommeElementId", "theSerializedEntity")));
	}

	@Test
	public void offlineLoadShouldWriteNonListElement() throws JSONException {

		JSONObject query = new JSONObject();
		query.put("typeRef", "app/type");
		query.put("elementId", "someElementId");

		JSONArray queryArr = new JSONArray();
		queryArr.put(query);

		JSONArray args = new JSONArray();
		args.put(queryArr);
		myNative.invokeMethod("offline.load", args);

		verify(offlineRepo).load("app/type", NO_LIST_ID, "someElementId");
	}

	@Test
	public void offlineWriteShouldFailWhenNoBody() throws JSONException {

		JSONObject query = new JSONObject();
		query.put("typeRef", "app/type");
		query.put("listId", "someListId");
		query.put("elementId", "someElementId");

		JSONArray args = new JSONArray();
		args.put(query);
		myNative.invokeMethod("offline.load", args);

		verify(offlineRepo).load("app/type", "someListId", "someElementId");
	}

}
