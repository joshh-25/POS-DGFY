package com.dgfy.standalonepos

import android.content.Context
import androidx.work.Data
import androidx.work.ExistingWorkPolicy
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.WorkInfo
import androidx.work.WorkManager
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

class StandalonePosSyncModule(
    reactContext: ReactApplicationContext
) : ReactContextBaseJavaModule(reactContext) {
    private val workManager = WorkManager.getInstance(reactContext)
    private val prefs = reactContext.getSharedPreferences(StandalonePosSyncWorker.PREFS_NAME, Context.MODE_PRIVATE)

    override fun getName(): String = "StandalonePosSync"

    @ReactMethod
    fun enqueueAuthorizedSync(deviceId: String, promise: Promise) {
        try {
            val request = OneTimeWorkRequestBuilder<StandalonePosSyncWorker>()
                .setInputData(
                    Data.Builder()
                        .putString(StandalonePosSyncWorker.KEY_DEVICE_ID, deviceId)
                        .build()
                )
                .build()

            workManager.enqueueUniqueWork(
                "standalone-pos-authorized-sync",
                ExistingWorkPolicy.REPLACE,
                request
            )

            promise.resolve(
                Arguments.createMap().apply {
                    putString("workId", request.id.toString())
                    putString("state", WorkInfo.State.ENQUEUED.name)
                }
            )
        } catch (exception: Exception) {
            promise.reject("ENQUEUE_SYNC_FAILED", exception.message, exception)
        }
    }

    @ReactMethod
    fun getLastAuthorizedSyncStatus(promise: Promise) {
        try {
            promise.resolve(
                Arguments.createMap().apply {
                    putString("workId", prefs.getString(StandalonePosSyncWorker.KEY_LAST_WORK_ID, "") ?: "")
                    putString("deviceId", prefs.getString(StandalonePosSyncWorker.KEY_LAST_DEVICE_ID, "") ?: "")
                    putString("status", prefs.getString(StandalonePosSyncWorker.KEY_LAST_STATUS, "idle") ?: "idle")
                    putDouble(
                        "completedAt",
                        prefs.getLong(StandalonePosSyncWorker.KEY_LAST_COMPLETED_AT, 0L).toDouble()
                    )
                }
            )
        } catch (exception: Exception) {
            promise.reject("GET_SYNC_STATUS_FAILED", exception.message, exception)
        }
    }
}
