package com.dgfy.standalonepos

import android.content.Context
import androidx.work.Data
import androidx.work.Worker
import androidx.work.WorkerParameters

class StandalonePosSyncWorker(
    appContext: Context,
    params: WorkerParameters
) : Worker(appContext, params) {
    override fun doWork(): Result {
        val prefs = applicationContext.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        val completedAt = System.currentTimeMillis()
        prefs.edit()
            .putString(KEY_LAST_WORK_ID, id.toString())
            .putLong(KEY_LAST_COMPLETED_AT, completedAt)
            .putString(KEY_LAST_DEVICE_ID, inputData.getString(KEY_DEVICE_ID) ?: "")
            .putString(KEY_LAST_STATUS, "completed")
            .apply()

        return Result.success(
            Data.Builder()
                .putString(KEY_LAST_WORK_ID, id.toString())
                .putLong(KEY_LAST_COMPLETED_AT, completedAt)
                .build()
        )
    }

    companion object {
        const val PREFS_NAME = "standalone_pos_sync_worker"
        const val KEY_DEVICE_ID = "device_id"
        const val KEY_LAST_WORK_ID = "last_work_id"
        const val KEY_LAST_COMPLETED_AT = "last_completed_at"
        const val KEY_LAST_DEVICE_ID = "last_device_id"
        const val KEY_LAST_STATUS = "last_status"
    }
}
