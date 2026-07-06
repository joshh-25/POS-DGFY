package com.dgfy.iminwrapper

import android.os.Build

object AppConfig {
    // Sourced from the active product flavor (prod/beta) in app/build.gradle.kts.
    private val LIVE_POS_ORIGIN = BuildConfig.LIVE_POS_ORIGIN
    private val LIVE_POS_HOST = BuildConfig.LIVE_POS_HOST
    private val SKUPERVISOR_HOST = BuildConfig.SKUPERVISOR_HOST
    private const val LOCAL_LAN_HOST = "10.123.37.45"
    private const val EMULATOR_HOST = "10.0.2.2"
    private const val POS_PORT = 5174
    private const val WEB_POS_PREVIEW_PORT = 5174
    private const val BACKEND_PORT = 5000

    fun hostedPosUrl(): String {
        return hostedPosUrl(System.currentTimeMillis())
    }

    fun hostedPosUrl(cacheBust: Long): String {
        return if (useLivePosOrigin()) {
            "$LIVE_POS_ORIGIN/?apk_build=$cacheBust"
        } else {
            "http://${activeLocalHost()}:$POS_PORT/?apk_build=$cacheBust"
        }
    }

    fun hostedWebPosUrl(): String {
        return hostedWebPosUrl(System.currentTimeMillis())
    }

    fun hostedWebPosUrl(cacheBust: Long): String {
        return if (useLivePosOrigin()) {
            "$LIVE_POS_ORIGIN/?apk_build=$cacheBust#/terminal"
        } else {
            "http://${activeLocalHost()}:$WEB_POS_PREVIEW_PORT/?apk_build=$cacheBust#/terminal"
        }
    }

    fun defaultApiBaseUrl(): String {
        return if (useLivePosOrigin()) {
            "$LIVE_POS_ORIGIN/api/v1"
        } else {
            "http://${activeLocalHost()}:$BACKEND_PORT/api/v1"
        }
    }

    fun allowedHosts(): Set<String> {
        return setOf(
            LIVE_POS_HOST,
            SKUPERVISOR_HOST,
            activeLocalHost(),
            LOCAL_LAN_HOST,
            EMULATOR_HOST,
            "localhost",
            "127.0.0.1"
        )
    }

    private fun activeLocalHost(): String {
        return if (isProbablyEmulator()) EMULATOR_HOST else LOCAL_LAN_HOST
    }

    private fun useLivePosOrigin(): Boolean {
        return !BuildConfig.DEBUG && !isProbablyEmulator()
    }

    private fun isProbablyEmulator(): Boolean {
        return Build.FINGERPRINT.contains("generic", ignoreCase = true) ||
            Build.MODEL.contains("Emulator", ignoreCase = true) ||
            Build.MODEL.contains("sdk_gphone", ignoreCase = true) ||
            Build.HARDWARE.contains("ranchu", ignoreCase = true)
    }
}
