package com.dgfy.iminwrapper

import android.os.Build
import android.webkit.JavascriptInterface
import org.json.JSONObject
import java.util.concurrent.Executors

class IminBridge(
    private val drawerController: DrawerController,
    private val onWebPosReady: (() -> Unit)? = null,
    private val onShowMessage: ((String, String) -> Unit)? = null,
    private val onPlayOrderAlert: ((String) -> Unit)? = null,
    private val onAsyncResult: ((String, String) -> Unit)? = null
) {
    private val hardwareExecutor = Executors.newSingleThreadExecutor()

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
        return commandResultJson(drawerController.openCashDrawer())
    }

    @JavascriptInterface
    fun printReceipt(receiptText: String, openDrawerAfterPrint: Boolean): String {
        return commandResultJson(drawerController.printReceipt(receiptText, openDrawerAfterPrint))
    }

    // Added for issue #321 alongside printReceipt rather than changing it in place --
    // this wrapper's WebView bridge and the web POS it hosts ship independently, so an
    // APK already in the field must keep working against the old two-arg call while a
    // newer web build feature-detects this one (see iminHardwareBridge.js).
    // logoSource is the tenant's resolved company icon URL (or a data: URI); pass ""
    // to fall back to the bundled DGFY icon. @JavascriptInterface only marshals
    // primitives and String, so this can't take an options object the way the JS
    // bridge's now-removed printBitmap attempt assumed.
    @JavascriptInterface
    fun printReceiptWithLogo(receiptText: String, openDrawerAfterPrint: Boolean, logoSource: String): String {
        return commandResultJson(drawerController.printReceipt(receiptText, openDrawerAfterPrint, logoSource))
    }

    // New APKs expose non-blocking hardware paths while retaining the synchronous
    // methods above for older hosted-web builds. The single executor preserves
    // physical command order without occupying the WebView JavaScript thread.
    @JavascriptInterface
    fun printReceiptWithLogoAsync(
        requestId: String,
        receiptText: String,
        openDrawerAfterPrint: Boolean,
        logoSource: String
    ): String = enqueueAsyncCommand(requestId, "Receipt print") {
        drawerController.printReceipt(receiptText, openDrawerAfterPrint, logoSource)
    }

    @JavascriptInterface
    fun printReceiptAsync(
        requestId: String,
        receiptText: String,
        openDrawerAfterPrint: Boolean
    ): String = enqueueAsyncCommand(requestId, "Receipt print") {
        drawerController.printReceipt(receiptText, openDrawerAfterPrint)
    }

    @JavascriptInterface
    fun openCashDrawerAsync(requestId: String): String =
        enqueueAsyncCommand(requestId, "Cash drawer") {
            drawerController.openCashDrawer()
        }

    private fun enqueueAsyncCommand(
        requestId: String,
        commandLabel: String,
        command: () -> DrawerController.DrawerCommandResult
    ): String {
        val normalizedRequestId = requestId.trim()
        if (normalizedRequestId.isEmpty() || normalizedRequestId.length > MAX_REQUEST_ID_LENGTH) {
            return JSONObject()
                .put("success", false)
                .put("message", "Invalid asynchronous hardware request id")
                .toString()
        }
        val asyncResultCallback = onAsyncResult ?: return JSONObject()
            .put("success", false)
            .put("message", "Asynchronous hardware result callback is unavailable")
            .toString()

        return try {
            hardwareExecutor.execute {
                val resultJson = try {
                    commandResultJson(command())
                } catch (error: RuntimeException) {
                    JSONObject()
                        .put("success", false)
                        .put("message", error.message ?: "$commandLabel command failed")
                        .put("mayHaveExecuted", true)
                        .put("drawerOpened", false)
                        .put("diagnostics", drawerController.diagnosticsJson())
                        .toString()
                }
                runCatching { asyncResultCallback.invoke(normalizedRequestId, resultJson) }
            }
            JSONObject()
                .put("success", true)
                .put("accepted", true)
                .put("message", "$commandLabel command accepted")
                .toString()
        } catch (_: RuntimeException) {
            JSONObject()
                .put("success", false)
                .put("message", "$commandLabel command could not be scheduled")
                .toString()
        }
    }

    private fun commandResultJson(result: DrawerController.DrawerCommandResult): String =
        JSONObject()
            .put("success", result.success)
            .put("message", result.message)
            .put("mayHaveExecuted", result.mayHaveExecuted)
            .put("drawerOpened", result.drawerOpened)
            .put("diagnostics", drawerController.diagnosticsJson())
            .toString()

    fun release() {
        hardwareExecutor.shutdownNow()
    }

    companion object {
        private const val MAX_REQUEST_ID_LENGTH = 120
    }
}
