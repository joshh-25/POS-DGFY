package com.dgfy.standalonepos

import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.ReadableMap
import com.facebook.react.bridge.WritableArray
import com.facebook.react.bridge.WritableMap
import org.json.JSONArray
import org.json.JSONObject

class StandalonePosHardwareModule(
    reactContext: ReactApplicationContext
) : ReactContextBaseJavaModule(reactContext) {
    private val appContext = reactContext.applicationContext
    private val drawerController: DrawerController by lazy(LazyThreadSafetyMode.NONE) {
        DrawerController(appContext)
    }

    override fun getName(): String = "StandalonePosHardware"

    // logoSource (added for issue #321) is the tenant's resolved company icon URL or
    // a data: URI; pass "" to fall back to the bundled DGFY icon (see
    // ReceiptLogoProvider). @ReactMethod's arity is fixed once declared, so
    // standalonePosHardware.ts must always supply this argument, not omit it.
    @ReactMethod
    fun printReceipt(receiptText: String, openDrawerAfterPrint: Boolean, logoSource: String, promise: Promise) {
        try {
            val result = drawerController.printReceipt(receiptText, openDrawerAfterPrint, logoSource)
            promise.resolve(
                Arguments.createMap().apply {
                    putBoolean("success", result.success)
                    putString("message", result.message)
                }
            )
        } catch (exception: Exception) {
            promise.reject("PRINT_RECEIPT_FAILED", exception.message, exception)
        }
    }

    @ReactMethod
    fun printOrderTicket(ticketText: String, promise: Promise) {
        printReceipt(ticketText, false, "", promise)
    }

    @ReactMethod
    fun openCashDrawer(reason: String?, localTransaction: ReadableMap?, promise: Promise) {
        try {
            val result = drawerController.openCashDrawer()
            promise.resolve(
                Arguments.createMap().apply {
                    putBoolean("success", result.success)
                    putString("message", result.message)
                    putString("reason", reason ?: "")
                    putMap("localTransaction", localTransaction)
                }
            )
        } catch (exception: Exception) {
            promise.reject("OPEN_CASH_DRAWER_FAILED", exception.message, exception)
        }
    }

    @ReactMethod
    fun getHardwareDiagnostics(promise: Promise) {
        try {
            promise.resolve(jsonObjectToWritableMap(drawerController.diagnosticsJson()))
        } catch (exception: Exception) {
            promise.reject("HARDWARE_DIAGNOSTICS_FAILED", exception.message, exception)
        }
    }

    @ReactMethod
    fun scanBarcode(promise: Promise) {
        promise.resolve(
            Arguments.createMap().apply {
                putBoolean("available", false)
                putString("message", "Scanner integration is not yet configured for this device build.")
            }
        )
    }

    override fun invalidate() {
        drawerController.release()
        super.invalidate()
    }

    private fun jsonObjectToWritableMap(jsonObject: JSONObject): WritableMap {
        val map = Arguments.createMap()
        val keys = jsonObject.keys()
        while (keys.hasNext()) {
            val key = keys.next()
            when (val value = jsonObject.opt(key)) {
                null, JSONObject.NULL -> map.putNull(key)
                is Boolean -> map.putBoolean(key, value)
                is Int -> map.putInt(key, value)
                is Long -> map.putDouble(key, value.toDouble())
                is Float -> map.putDouble(key, value.toDouble())
                is Double -> map.putDouble(key, value)
                is String -> map.putString(key, value)
                is JSONObject -> map.putMap(key, jsonObjectToWritableMap(value))
                is JSONArray -> map.putArray(key, jsonArrayToWritableArray(value))
                else -> map.putString(key, value.toString())
            }
        }
        return map
    }

    private fun jsonArrayToWritableArray(array: JSONArray): WritableArray = Arguments.createArray().apply {
        for (index in 0 until array.length()) {
            when (val value = array.opt(index)) {
                null, JSONObject.NULL -> pushNull()
                is Boolean -> pushBoolean(value)
                is Int -> pushInt(value)
                is Long -> pushDouble(value.toDouble())
                is Float -> pushDouble(value.toDouble())
                is Double -> pushDouble(value)
                is String -> pushString(value)
                is JSONObject -> pushMap(jsonObjectToWritableMap(value))
                is JSONArray -> pushArray(jsonArrayToWritableArray(value))
                else -> pushString(value.toString())
            }
        }
    }
}
