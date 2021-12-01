package de.tutao.tutanota;

import org.junit.Before;
import org.junit.runner.RunWith;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.annotation.Config;

@RunWith(RobolectricTestRunner.class)
@Config(manifest = Config.NONE)
public class NativeTest {
	MainActivity activity;
	Native myNative; // apparently `native` is a keyword

	@Before
	public void setup() {

		myNative = new Native(		activity, sseStorage, alarmNotificationsManager, offlineRepo);
	}
}
