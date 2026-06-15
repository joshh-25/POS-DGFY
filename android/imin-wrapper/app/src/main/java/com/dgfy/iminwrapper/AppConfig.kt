package com.dgfy.iminwrapper

import android.os.Build

object AppConfig {
    private const val LAN_HOST = "10.123.37.45"
    private const val EMULATOR_HOST = "10.0.2.2"
    private const val POS_PORT = 5174
    private const val WEB_POS_PREVIEW_PORT = 5174
    private const val BACKEND_PORT = 5000

    fun hostedPosUrl(): String {
        return hostedPosUrl(System.currentTimeMillis())
    }

    fun hostedPosUrl(cacheBust: Long): String {
        return "http://${activeHost()}:$POS_PORT/?apk_build=$cacheBust"
    }

    fun hostedWebPosUrl(): String {
        return hostedWebPosUrl(System.currentTimeMillis())
    }

    fun hostedWebPosUrl(cacheBust: Long): String {
        return "http://${activeHost()}:$WEB_POS_PREVIEW_PORT/?apk_build=$cacheBust#/terminal"
    }

    fun defaultApiBaseUrl(): String {
        return "http://${activeHost()}:$BACKEND_PORT/api/v1"
    }

    fun allowedHosts(): Set<String> {
        return setOf(
            activeHost(),
            LAN_HOST,
            EMULATOR_HOST,
            "localhost",
            "127.0.0.1"
        )
    }

    private fun activeHost(): String {
        return if (isProbablyEmulator()) EMULATOR_HOST else LAN_HOST
    }

    private fun isProbablyEmulator(): Boolean {
        return Build.FINGERPRINT.contains("generic", ignoreCase = true) ||
            Build.MODEL.contains("Emulator", ignoreCase = true) ||
            Build.MODEL.contains("sdk_gphone", ignoreCase = true) ||
            Build.HARDWARE.contains("ranchu", ignoreCase = true)
    }
}
