package com.dgfy.iminwrapper

import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import android.os.RemoteException
import android.util.Log
import com.imin.printer.INeoPrinterCallback
import com.imin.printer.PrinterHelper
import org.json.JSONObject

class DrawerController(
    private val context: Context
) {
    private val appContext = context.applicationContext
    private val printerHelper = PrinterHelper.getInstance()
    private val bluetoothEscPosController = BluetoothEscPosController(appContext)

    @Volatile
    private var isPrinterServiceConnected = false
    private var bindRequested = false
    private var lastConnectionEvent = "not_initialized"
    private var lastCommand = "none"
    private var lastCommandSuccess = false
    private var lastErrorClass = ""
    private var lastErrorMessage = ""

    init {
        ensurePrinterServiceBound(waitForConnection = false)
    }

    fun openCashDrawer(): DrawerCommandResult {
        lastCommand = "open_cash_drawer"
        ensurePrinterServiceBound(waitForConnection = true)

        if (!isPrinterServiceConnected) {
            lastCommandSuccess = false
            lastErrorClass = "PrinterServiceDisconnected"
            lastErrorMessage = "iMin printer service is not connected"
            return openCashDrawerWithBluetoothFallback("iMin printer service is not connected")
        }

        return try {
            val supportsCashBox = printerHelper.supportCashBox()
            if (!supportsCashBox) {
                lastCommandSuccess = false
                lastErrorClass = "CashDrawerUnsupported"
                lastErrorMessage = "iMin printer service reports cash drawer is not supported"
                return openCashDrawerWithBluetoothFallback(lastErrorMessage)
            }

            printerHelper.openDrawer()
            lastCommandSuccess = true
            lastErrorClass = ""
            lastErrorMessage = ""
            Log.i(TAG, "Cash drawer open command sent")
            DrawerCommandResult(
                success = true,
                message = "Cash drawer open command sent"
            )
        } catch (exception: RuntimeException) {
            lastCommandSuccess = false
            lastErrorClass = exception.javaClass.name
            lastErrorMessage = exception.message ?: "Failed to open cash drawer"
            Log.e(TAG, "Failed to open cash drawer", exception)
            openCashDrawerWithBluetoothFallback(lastErrorMessage)
        }
    }

    fun printReceipt(receiptText: String, openDrawerAfterPrint: Boolean): DrawerCommandResult {
        lastCommand = if (openDrawerAfterPrint) "print_receipt_and_open_drawer" else "print_receipt"
        val bluetoothResult = bluetoothEscPosController.printReceipt(receiptText, openDrawerAfterPrint)
        if (bluetoothResult.success) {
            lastCommandSuccess = true
            lastErrorClass = ""
            lastErrorMessage = ""
            return DrawerCommandResult(
                success = true,
                message = bluetoothResult.message
            )
        }

        lastCommandSuccess = false
        lastErrorClass = "BluetoothReceiptPrintFailed"
        lastErrorMessage = bluetoothResult.message

        ensurePrinterServiceBound(waitForConnection = true)

        if (!isPrinterServiceConnected) {
            lastCommandSuccess = false
            lastErrorClass = "PrinterServiceDisconnected"
            lastErrorMessage = "iMin printer service is not connected"
            return DrawerCommandResult(
                success = false,
                message = "${buildDiagnosticMessage("Bluetooth receipt failed: ${bluetoothResult.message}. iMin printer service is not connected")}"
            )
        }

        val normalizedText = receiptText.trim()
        if (normalizedText.isEmpty()) {
            lastCommandSuccess = false
            lastErrorClass = "EmptyReceipt"
            lastErrorMessage = "Receipt text is empty"
            return DrawerCommandResult(
                success = false,
                message = "Receipt text is empty"
            )
        }

        return try {
            printerHelper.printText(
                normalizedText + "\n\n",
                object : INeoPrinterCallback() {
                    @Throws(RemoteException::class)
                    override fun onRunResult(isSuccess: Boolean) {
                        Log.i(TAG, "Receipt print command result: $isSuccess")
                    }

                    @Throws(RemoteException::class)
                    override fun onReturnString(result: String?) {
                        Log.i(TAG, "Receipt print return: ${result ?: ""}")
                    }

                    @Throws(RemoteException::class)
                    override fun onRaiseException(code: Int, msg: String?) {
                        Log.e(TAG, "Receipt print exception $code: ${msg ?: ""}")
                    }

                    @Throws(RemoteException::class)
                    override fun onPrintResult(code: Int, msg: String?) {
                        Log.i(TAG, "Receipt print result $code: ${msg ?: ""}")
                    }
                }
            )
            printerHelper.printAndFeedPaper(80)
            printerHelper.partialCut()

            if (openDrawerAfterPrint) {
                printerHelper.openDrawer()
            }

            lastCommandSuccess = true
            lastErrorClass = ""
            lastErrorMessage = ""
            DrawerCommandResult(
                success = true,
                message = if (openDrawerAfterPrint) {
                    "Receipt print command sent and cash drawer open command sent"
                } else {
                    "Receipt print command sent"
                }
            )
        } catch (exception: RuntimeException) {
            lastCommandSuccess = false
            lastErrorClass = exception.javaClass.name
            lastErrorMessage = exception.message ?: "Failed to print receipt"
            Log.e(TAG, "Failed to print receipt", exception)
            printReceiptWithBluetoothFallback(
                receiptText = receiptText,
                openDrawerAfterPrint = openDrawerAfterPrint,
                baseMessage = lastErrorMessage
            )
        }
    }

    fun diagnosticsJson(): JSONObject {
        val visibility = printerServiceVisibility(
            PRINTER_SERVICE_PACKAGE,
            PRINTER_SERVICE_ACTION,
            PRINTER_SERVICE_CLASS
        )
        val legacyVisibility = printerServiceVisibility(
            LEGACY_PRINTER_SERVICE_PACKAGE,
            LEGACY_PRINTER_SERVICE_ACTION,
            LEGACY_PRINTER_SERVICE_CLASS
        )

        return JSONObject()
            .put("bindRequested", bindRequested)
            .put("printerServiceConnected", isPrinterServiceConnected)
            .put("lastConnectionEvent", lastConnectionEvent)
            .put("lastCommand", lastCommand)
            .put("lastCommandSuccess", lastCommandSuccess)
            .put("lastErrorClass", lastErrorClass)
            .put("lastErrorMessage", lastErrorMessage)
            .put("printerServicePackage", PRINTER_SERVICE_PACKAGE)
            .put("printerServiceAction", PRINTER_SERVICE_ACTION)
            .put("printerServiceClass", PRINTER_SERVICE_CLASS)
            .put("printerServicePackageVisible", visibility.packageVisible)
            .put("printerServicePackageEnabled", visibility.packageEnabled)
            .put("printerServiceResolvable", visibility.serviceResolvable)
            .put("printerServiceResolvePackage", visibility.resolvePackage)
            .put("printerServiceResolveName", visibility.resolveName)
            .put("legacyPrinterServicePackage", LEGACY_PRINTER_SERVICE_PACKAGE)
            .put("legacyPrinterServiceAction", LEGACY_PRINTER_SERVICE_ACTION)
            .put("legacyPrinterServiceClass", LEGACY_PRINTER_SERVICE_CLASS)
            .put("legacyPrinterServicePackageVisible", legacyVisibility.packageVisible)
            .put("legacyPrinterServicePackageEnabled", legacyVisibility.packageEnabled)
            .put("legacyPrinterServiceResolvable", legacyVisibility.serviceResolvable)
            .put("legacyPrinterServiceResolvePackage", legacyVisibility.resolvePackage)
            .put("legacyPrinterServiceResolveName", legacyVisibility.resolveName)
            .put("bluetoothEscPos", bluetoothEscPosController.diagnosticsJson())
    }

    fun testBluetoothDrawerPulse(label: String, bytes: ByteArray): DrawerCommandResult {
        lastCommand = "test_bluetooth_drawer_pulse_$label"
        val result = bluetoothEscPosController.openDrawerWithPulse(label, bytes)
        lastCommandSuccess = result.success
        if (result.success) {
            lastErrorClass = ""
            lastErrorMessage = ""
        } else {
            lastErrorClass = "BluetoothDrawerPulseFailed"
            lastErrorMessage = result.message
        }
        return DrawerCommandResult(
            success = result.success,
            message = result.message
        )
    }

    fun release() {
        try {
            printerHelper.deInitPrinterService(appContext)
            isPrinterServiceConnected = false
        } catch (exception: RuntimeException) {
            Log.w(TAG, "Failed to unbind iMin printer service", exception)
        }
    }

    data class DrawerCommandResult(
        val success: Boolean,
        val message: String
    )

    private fun buildDiagnosticMessage(baseMessage: String): String {
        val visibility = printerServiceVisibility(
            PRINTER_SERVICE_PACKAGE,
            PRINTER_SERVICE_ACTION,
            PRINTER_SERVICE_CLASS
        )
        val legacyVisibility = printerServiceVisibility(
            LEGACY_PRINTER_SERVICE_PACKAGE,
            LEGACY_PRINTER_SERVICE_ACTION,
            LEGACY_PRINTER_SERVICE_CLASS
        )
        return "$baseMessage | bindRequested=$bindRequested, serviceConnected=$isPrinterServiceConnected, lastConnection=$lastConnectionEvent, errorClass=$lastErrorClass, servicePackageVisible=${visibility.packageVisible}, servicePackageEnabled=${visibility.packageEnabled}, serviceResolvable=${visibility.serviceResolvable}, legacyServiceVisible=${legacyVisibility.packageVisible}, legacyServiceResolvable=${legacyVisibility.serviceResolvable}"
    }

    private fun openCashDrawerWithBluetoothFallback(baseMessage: String): DrawerCommandResult {
        val bluetoothResult = bluetoothEscPosController.openDrawer()
        if (bluetoothResult.success) {
            lastCommandSuccess = true
            return DrawerCommandResult(
                success = true,
                message = "$baseMessage. Fallback succeeded: ${bluetoothResult.message}"
            )
        }

        return DrawerCommandResult(
            success = false,
            message = "${buildDiagnosticMessage(baseMessage)} | Bluetooth fallback failed: ${bluetoothResult.message}"
        )
    }

    private fun printReceiptWithBluetoothFallback(
        receiptText: String,
        openDrawerAfterPrint: Boolean,
        baseMessage: String
    ): DrawerCommandResult {
        val bluetoothResult = bluetoothEscPosController.printReceipt(receiptText, openDrawerAfterPrint)
        if (bluetoothResult.success) {
            lastCommandSuccess = true
            return DrawerCommandResult(
                success = true,
                message = "$baseMessage. Fallback succeeded: ${bluetoothResult.message}"
            )
        }

        return DrawerCommandResult(
            success = false,
            message = "${buildDiagnosticMessage(baseMessage)} | Bluetooth fallback failed: ${bluetoothResult.message}"
        )
    }

    private fun ensurePrinterServiceBound(waitForConnection: Boolean): Boolean {
        if (isPrinterServiceConnected) {
            return true
        }

        try {
            bindRequested = printerHelper.initPrinterService(appContext)
        } catch (exception: RuntimeException) {
            bindRequested = false
            lastConnectionEvent = "bind_exception"
            lastErrorClass = exception.javaClass.name
            lastErrorMessage = exception.message ?: "Unable to bind iMin printer service"
            Log.e(TAG, "Unable to bind iMin printer service", exception)
            return false
        }

        if (!bindRequested) {
            val visibility = printerServiceVisibility(
                PRINTER_SERVICE_PACKAGE,
                PRINTER_SERVICE_ACTION,
                PRINTER_SERVICE_CLASS
            )
            lastConnectionEvent = "bind_request_failed"
            lastErrorClass = "BindRequestFailed"
            lastErrorMessage = "Unable to bind iMin printer service. servicePackageVisible=${visibility.packageVisible}, servicePackageEnabled=${visibility.packageEnabled}, serviceResolvable=${visibility.serviceResolvable}"
            Log.e(TAG, lastErrorMessage)
            return false
        }

        lastConnectionEvent = "bind_requested"

        if (waitForConnection) {
            waitForPrinterServiceConnection()
        } else {
            refreshPrinterServiceConnection()
        }

        return isPrinterServiceConnected
    }

    private fun waitForPrinterServiceConnection(timeoutMs: Long = 2_500L) {
        val deadline = System.currentTimeMillis() + timeoutMs
        while (!isPrinterServiceConnected && System.currentTimeMillis() < deadline) {
            refreshPrinterServiceConnection()
            try {
                Thread.sleep(100L)
            } catch (exception: InterruptedException) {
                Thread.currentThread().interrupt()
                return
            }
        }
    }

    private fun refreshPrinterServiceConnection() {
        val connected = PrinterHelper.getNeoPrinterService() != null
        isPrinterServiceConnected = connected
        if (connected) {
            lastConnectionEvent = "connected"
            lastErrorClass = ""
            lastErrorMessage = ""
        }
    }

    private fun printerServiceVisibility(
        servicePackage: String,
        serviceAction: String,
        serviceClass: String
    ): PrinterServiceVisibility {
        val packageManager = appContext.packageManager
        val packageInfo = try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                packageManager.getPackageInfo(
                    servicePackage,
                    PackageManager.PackageInfoFlags.of(0)
                )
            } else {
                @Suppress("DEPRECATION")
                packageManager.getPackageInfo(servicePackage, 0)
            }
        } catch (exception: PackageManager.NameNotFoundException) {
            null
        }

        val serviceIntent = Intent(serviceAction).setComponent(
            ComponentName(servicePackage, serviceClass)
        )
        val resolveInfo = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            packageManager.resolveService(
                serviceIntent,
                PackageManager.ResolveInfoFlags.of(0)
            )
        } else {
            @Suppress("DEPRECATION")
            packageManager.resolveService(serviceIntent, 0)
        }

        return PrinterServiceVisibility(
            packageVisible = packageInfo != null,
            packageEnabled = packageInfo?.applicationInfo?.enabled == true,
            serviceResolvable = resolveInfo?.serviceInfo != null,
            resolvePackage = resolveInfo?.serviceInfo?.packageName ?: "",
            resolveName = resolveInfo?.serviceInfo?.name ?: ""
        )
    }

    private data class PrinterServiceVisibility(
        val packageVisible: Boolean,
        val packageEnabled: Boolean,
        val serviceResolvable: Boolean,
        val resolvePackage: String,
        val resolveName: String
    )

    companion object {
        private const val TAG = "DrawerController"
        private const val PRINTER_SERVICE_PACKAGE = "com.imin.printerservice"
        private const val PRINTER_SERVICE_ACTION = "com.imin.printerservice.NeoPrinterService"
        private const val PRINTER_SERVICE_CLASS =
            "com.imin.printerservice.core.ApiAdapterManager.NeoPrinterService"
        private const val LEGACY_PRINTER_SERVICE_PACKAGE = "com.neo.printer.sdk"
        private const val LEGACY_PRINTER_SERVICE_ACTION =
            "com.neo.printer.sdk.core.ApiAdapterManager.NeoPrinterService"
        private const val LEGACY_PRINTER_SERVICE_CLASS =
            "com.neo.printer.sdk.core.ApiAdapterManager.NeoPrinterService"
    }
}
