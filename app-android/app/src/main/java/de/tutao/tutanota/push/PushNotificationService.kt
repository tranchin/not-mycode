package de.tutao.tutanota.push

import android.app.job.JobParameters
import android.content.Context
import android.content.Intent
import android.os.Handler
import android.os.Looper
import android.util.Log
import de.tutao.tutanota.*
import de.tutao.tutanota.alarms.AlarmNotificationsManager
import de.tutao.tutanota.alarms.SystemAlarmFacade
import de.tutao.tutanota.data.AppDatabase
import de.tutao.tutanota.data.SseInfo
import de.tutao.tutanota.push.SseClient.SseListener

class PushNotificationService : LifecycleJobService() {
	@Volatile
	private var jobParameters: JobParameters? = null
	private lateinit var localNotificationsFacade: LocalNotificationsFacade
	private lateinit var sseClient: SseClient

	override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
		super.onStartCommand(intent, flags, startId)
		Log.d(TAG, "Received onStartCommand, sender: " + intent?.getStringExtra("sender"))

		initializeForegroundService()

		if (atLeastOreo()) {
			Log.d(TAG, "Starting foreground")
			startForeground(1, localNotificationsFacade.makeConnectionNotification())
		}

		if (intent != null && intent.hasExtra(NOTIFICATION_DISMISSED_ADDR_EXTRA)) {
			val dismissAddresses = intent.getStringArrayListExtra(NOTIFICATION_DISMISSED_ADDR_EXTRA)
			localNotificationsFacade.notificationDismissed(
					dismissAddresses,
					intent.getBooleanExtra(MainActivity.IS_SUMMARY_EXTRA, false)
			)
		}

		return START_NOT_STICKY
	}

	private fun initializeForegroundService() {
		localNotificationsFacade = LocalNotificationsFacade(this)

		val appDatabase: AppDatabase = AppDatabase.getDatabase(this, allowMainThreadAccess = true)
		val crypto = AndroidNativeCryptoFacade(this)
		val keyStoreFacade = createAndroidKeyStoreFacade(crypto)
		val sseStorage = SseStorage(appDatabase, keyStoreFacade)
		val alarmNotificationsManager = AlarmNotificationsManager(
				sseStorage,
				crypto,
				SystemAlarmFacade(this),
				localNotificationsFacade
		)
		alarmNotificationsManager.reScheduleAlarms()
		sseClient = SseClient(
				crypto,
				sseStorage,
				NetworkObserver(this, this),
				NotificationSseListener(localNotificationsFacade, sseStorage, alarmNotificationsManager)
		)
		sseStorage.observeUsers().observeForever { userInfos ->
			Log.d(TAG, "sse storage updated " + userInfos.size)
			val userIds: MutableSet<String> = HashSet()
			for (userInfo in userInfos) {
				userIds.add(userInfo.userId)
			}
			if (userIds.isEmpty()) {
				sseClient.stopConnection()
				finishJobIfNeeded()
				stopForegroundService()
			} else {
				sseClient.restartConnectionIfNeeded(
						SseInfo(
								sseStorage.getPushIdentifier()!!,
								userIds,
								sseStorage.getSseOrigin()!!
						)
				)
			}
		}
	}

	//FIXME start Foreground gets called multiple times and service is not stopping

	private fun stopForegroundService() {
		Log.d(TAG, "Stopping foreground")
		stopForeground(true)
		stopSelf()
	}

	override fun onStartJob(params: JobParameters): Boolean {
		Log.d(TAG, "onStartJob")
		jobParameters = params
		return true
	}

	override fun onStopJob(params: JobParameters): Boolean {
		Log.d(TAG, "The job is finished")
		return true
	}

	private fun scheduleJobFinish() {
		if (jobParameters != null) {
			Handler(Looper.getMainLooper()).postDelayed({
				finishJobIfNeeded()
				stopForegroundService()
			}, 20000)
		}
	}

	private fun finishJobIfNeeded() {
		if (jobParameters != null) {
			jobFinished(jobParameters, true)
			jobParameters = null
		}
	}

	override fun onDestroy() {
		Log.d(TAG, "onDestroy")
		super.onDestroy()
	}

	companion object {
		private const val TAG = "PushNotificationService"
		fun startIntent(context: Context?, sender: String?): Intent {
			val intent = Intent(context, PushNotificationService::class.java)
			intent.putExtra("sender", sender)
			return intent
		}
	}

	private inner class NotificationSseListener(
			notificationsFacade: LocalNotificationsFacade,
			sseStorage: SseStorage,
			alarmNotificationsManager: AlarmNotificationsManager
	) : SseListener {

		private val tutanotaNotificationsHandler = TutanotaNotificationsHandler(notificationsFacade, sseStorage, alarmNotificationsManager)

		override fun onStartingConnection(): Boolean {
			return tutanotaNotificationsHandler.onConnect()
		}

		override fun onMessage(data: String, sseInfo: SseInfo?) {
			if ("notification" == data) {
				tutanotaNotificationsHandler.onNewNotificationAvailable(sseInfo)
			}
		}

		override fun onConnectionEstablished() {
			// After establishing connection we finish in some time.
			Log.d(TAG, "onConnectionEstablished")
			scheduleJobFinish()
		}

		override fun onNotAuthorized(userId: String) {
			tutanotaNotificationsHandler.onNotAuthorized(userId)
		}

		override fun onStoppingReconnectionAttempts() {
			finishJobIfNeeded()
			stopForegroundService()
		}
	}
}