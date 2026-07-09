package com.dgfy.iminwrapper

import android.os.Build
import android.webkit.JavascriptInterface
import org.json.JSONObject

class IminBridge(
    private val drawerController: DrawerController,
    private val onWebPosReady: (() -> Unit)? = null,
    private val onShowMessage: ((String, String) -> Unit)? = null,
    private val onPlayOrderAlert: ((String) -> Unit)? = null
) {
    @JavascriptInterface
    fun isIminWrapper(): Boolean = true

    @JavascriptInterface
    fun notifyWebPosReady(): String {
        onWebPosReady?.invoke()
        return JSONObject()
            .put("success", true)
            .put("message", "Web POS ready")
            .toString()
    }

    @JavascriptInterface
    fun getDeviceInfo(): String {
        return """{"manufacturer":"${Build.MANUFACTURER}","model":"${Build.MODEL}","sdkInt":${Build.VERSION.SDK_INT}}"""
    }

    @JavascriptInterface
    fun getHardwareDiagnostics(): String {
        return JSONObject()
            .put("manufacturer", Build.MANUFACTURER)
            .put("model", Build.MODEL)
            .put("device", Build.DEVICE)
            .put("product", Build.PRODUCT)
            .put("sdkInt", Build.VERSION.SDK_INT)
            .put("printer", drawerController.diagnosticsJson())
            .toString()
    }

    @JavascriptInterface
    fun showMessage(title: String, message: String): String {
        onShowMessage?.invoke(title, message)
        return JSONObject()
            .put("success", true)
            .put("message", "Native message shown")
            .toString()
    }

    @JavascriptInterface
    fun playOrderAlert(soundType: String): String {
        onPlayOrderAlert?.invoke(soundType)
        return JSONObject()
            .put("success", true)
            .put("message", "Order alert played")
            .toString()
    }

    @JavascriptInterface
    fun openCashDrawer(): String {
        val result = drawerController.openCashDrawer()
        return JSONObject()
            .put("success", result.success)
            .put("message", result.message)
            .put("diagnostics", drawerController.diagnosticsJson())
            .toString()
    }

    @JavascriptInterface
    fun printReceipt(receiptText: String, openDrawerAfterPrint: Boolean): String {
        val result = drawerController.printReceipt(receiptText, openDrawerAfterPrint)
        return JSONObject()
            .put("success", result.success)
            .put("message", result.message)
            .put("diagnostics", drawerController.diagnosticsJson())
            .toString()
    }
}
