package com.dgfy.iminwrapper

import android.os.Build

object AppConfig {
    private const val LAN_HOST = "192.168.4.104"
    private const val EMULATOR_HOST = "10.0.2.2"
    private const val POS_PORT = 5174

    fun hostedPosUrl(): String {
        return "http://${activeHost()}:$POS_PORT/"
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
