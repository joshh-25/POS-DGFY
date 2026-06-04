package com.dgfy.iminwrapper

import android.os.Build
import android.webkit.JavascriptInterface

class IminBridge {
    @JavascriptInterface
    fun isIminWrapper(): Boolean = true

    @JavascriptInterface
    fun getDeviceInfo(): String {
        return """{"manufacturer":"${Build.MANUFACTURER}","model":"${Build.MODEL}","sdkInt":${Build.VERSION.SDK_INT}}"""
    }
}
