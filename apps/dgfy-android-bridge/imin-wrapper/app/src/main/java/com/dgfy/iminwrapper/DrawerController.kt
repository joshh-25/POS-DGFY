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
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicReference

class DrawerController(
    private val context: Context
) {
    private val appContext = context.applicationContext
    private val printerHelper = PrinterHelper.getInstance()
    private val logoProvider = ReceiptLogoProvider(appContext)
    private val bluetoothEscPosController = BluetoothEscPosController(appContext, logoProvider)

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
                message = "Cash drawer open command sent",
                mayHaveExecuted = true,
                drawerOpened = true
            )
        } catch (exception: RuntimeException) {
            lastCommandSuccess = false
            lastErrorClass = exception.javaClass.name
            lastErrorMessage = exception.message ?: "Failed to open cash drawer"
            Log.e(TAG, "Failed to open cash drawer", exception)
            openCashDrawerWithBluetoothFallback(lastErrorMessage)
        }
    }

    fun printReceipt(
        receiptText: String,
        openDrawerAfterPrint: Boolean,
        logoSource: String = ""
    ): DrawerCommandResult {
        lastCommand = if (openDrawerAfterPrint) "print_receipt_and_open_drawer" else "print_receipt"
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

        ensurePrinterServiceBound(waitForConnection = true)
        if (isPrinterServiceConnected) {
            val builtInResult = printReceiptWithBuiltInPrinter(normalizedText, openDrawerAfterPrint, logoSource)
            if (builtInResult.success || builtInResult.mayHaveExecuted) {
                return builtInResult
            }

            return printReceiptWithBluetoothFallback(
                receiptText = normalizedText,
                openDrawerAfterPrint = openDrawerAfterPrint,
                logoSource = logoSource,
                baseMessage = builtInResult.message
            )
        }

        lastCommandSuccess = false
        lastErrorClass = "PrinterServiceDisconnected"
        lastErrorMessage = "iMin printer service is not connected"
        Log.w(TAG, buildDiagnosticMessage(lastErrorMessage))
        return printReceiptWithBluetoothFallback(
            receiptText = normalizedText,
            openDrawerAfterPrint = openDrawerAfterPrint,
            logoSource = logoSource,
            baseMessage = "No built-in receipt printer is connected to this device."
        )
    }

    private fun printReceiptWithBuiltInPrinter(
        receiptText: String,
        openDrawerAfterPrint: Boolean,
        logoSource: String
    ): DrawerCommandResult {
        val callbackResult = AtomicReference<PrinterCallbackResult?>(null)
        val callbackLatch = CountDownLatch(1)
        val callback = object : INeoPrinterCallback() {
            private fun complete(result: PrinterCallbackResult) {
                if (callbackResult.compareAndSet(null, result)) {
                    callbackLatch.countDown()
                }
            }

            @Throws(RemoteException::class)
            override fun onRunResult(isSuccess: Boolean) {
                Log.i(TAG, "Receipt print command result: $isSuccess")
                complete(PrinterCallbackResult(
                    success = isSuccess,
                    message = if (isSuccess) "Built-in receipt print confirmed" else "Built-in receipt print was rejected"
                ))
            }

            @Throws(RemoteException::class)
            override fun onReturnString(result: String?) {
                Log.i(TAG, "Receipt print return: ${result ?: ""}")
            }

            @Throws(RemoteException::class)
            override fun onRaiseException(code: Int, msg: String?) {
                val message = msg?.takeIf { it.isNotBlank() } ?: "Built-in receipt print exception $code"
                Log.e(TAG, "Receipt print exception $code: $message")
                complete(PrinterCallbackResult(false, message))
            }

            @Throws(RemoteException::class)
            override fun onPrintResult(code: Int, msg: String?) {
                val success = code == 0
                val message = msg?.takeIf { it.isNotBlank() }
                    ?: if (success) "Built-in receipt print confirmed" else "Built-in receipt print failed with code $code"
                Log.i(TAG, "Receipt print result $code: $message")
                complete(PrinterCallbackResult(success, message))
            }
        }

        val logoBitmap = logoProvider.resolveBitmap(logoSource)
        return try {
            if (logoBitmap != null) {
                printerHelper.printBitmapWithAlign(
                    logoBitmap,
                    BUILT_IN_LOGO_ALIGNMENT_CENTER,
                    loggingPrinterCallback("Receipt logo")
                )
            }
            printerHelper.printText(receiptText + "\n\n", callback)
            val callbackReceived = callbackLatch.await(PRINT_CALLBACK_TIMEOUT_MS, TimeUnit.MILLISECONDS)
            if (!callbackReceived) {
                lastCommandSuccess = false
                lastErrorClass = "PrinterCallbackTimeout"
                lastErrorMessage = "The built-in printer did not confirm the receipt in time. Check the printer before retrying."
                return DrawerCommandResult(
                    success = false,
                    message = lastErrorMessage,
                    mayHaveExecuted = true
                )
            }

            val confirmed = callbackResult.get()
            if (confirmed?.success != true) {
                lastCommandSuccess = false
                lastErrorClass = "PrinterCallbackFailure"
                lastErrorMessage = confirmed?.message ?: "The built-in printer reported a receipt failure."
                return DrawerCommandResult(
                    success = false,
                    message = lastErrorMessage,
                    mayHaveExecuted = true
                )
            }

            printerHelper.printAndFeedPaper(80)
            printerHelper.partialCut()
            if (openDrawerAfterPrint) {
                if (!printerHelper.supportCashBox()) {
                    lastCommandSuccess = false
                    lastErrorClass = "CashDrawerUnsupported"
                    lastErrorMessage = "Receipt printed, but the built-in cash drawer is not supported."
                    return DrawerCommandResult(
                        success = false,
                        message = lastErrorMessage,
                        mayHaveExecuted = true
                    )
                }
                printerHelper.openDrawer()
            }

            lastCommandSuccess = true
            lastErrorClass = ""
            lastErrorMessage = ""
            DrawerCommandResult(
                success = true,
                message = if (openDrawerAfterPrint) {
                    "Receipt print confirmed and cash drawer open command sent"
                } else {
                    confirmed.message
                },
                mayHaveExecuted = true,
                drawerOpened = openDrawerAfterPrint
            )
        } catch (exception: InterruptedException) {
            Thread.currentThread().interrupt()
            lastCommandSuccess = false
            lastErrorClass = exception.javaClass.name
            lastErrorMessage = "Receipt printing was interrupted. Check the printer before retrying."
            DrawerCommandResult(false, lastErrorMessage, mayHaveExecuted = true)
        } catch (exception: RuntimeException) {
            lastCommandSuccess = false
            lastErrorClass = exception.javaClass.name
            lastErrorMessage = exception.message ?: "Failed to print receipt"
            Log.e(TAG, "Failed to print receipt", exception)
            DrawerCommandResult(
                success = false,
                message = lastErrorMessage,
                mayHaveExecuted = callbackResult.get() != null
            )
        } finally {
            logoBitmap?.recycle()
        }
    }

    private fun loggingPrinterCallback(label: String): INeoPrinterCallback =
        object : INeoPrinterCallback() {
            @Throws(RemoteException::class)
            override fun onRunResult(isSuccess: Boolean) {
                Log.i(TAG, "$label command result: $isSuccess")
            }

            @Throws(RemoteException::class)
            override fun onReturnString(result: String?) {
                Log.i(TAG, "$label return: ${result ?: ""}")
            }

            @Throws(RemoteException::class)
            override fun onRaiseException(code: Int, msg: String?) {
                Log.e(TAG, "$label exception $code: ${msg ?: ""}")
            }

            @Throws(RemoteException::class)
            override fun onPrintResult(code: Int, msg: String?) {
                Log.i(TAG, "$label print result $code: ${msg ?: ""}")
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
            message = result.message,
            mayHaveExecuted = result.mayHaveExecuted,
            drawerOpened = result.success
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
        val message: String,
        val mayHaveExecuted: Boolean = false,
        val drawerOpened: Boolean = false
    )

    private data class PrinterCallbackResult(
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
                message = "$baseMessage. Fallback succeeded: ${bluetoothResult.message}",
                mayHaveExecuted = true,
                drawerOpened = true
            )
        }

        // See printReceipt's !isPrinterServiceConnected branch above -- same
        // policy: diagnostics logged and still attached separately, not
        // concatenated into the returned message. baseMessage is already a
        // short, caller-supplied sentence (e.g. "iMin printer service is
        // not connected"), so it's returned as-is rather than replaced.
        Log.w(TAG, "${buildDiagnosticMessage(baseMessage)} | Bluetooth fallback failed: ${bluetoothResult.message}")
        return DrawerCommandResult(
            success = false,
            message = baseMessage,
            mayHaveExecuted = bluetoothResult.mayHaveExecuted
        )
    }

    private fun printReceiptWithBluetoothFallback(
        receiptText: String,
        openDrawerAfterPrint: Boolean,
        logoSource: String,
        baseMessage: String
    ): DrawerCommandResult {
        val bluetoothResult = bluetoothEscPosController.printReceipt(receiptText, openDrawerAfterPrint, logoSource)
        if (bluetoothResult.success) {
            lastCommandSuccess = true
            return DrawerCommandResult(
                success = true,
                message = "$baseMessage. Fallback succeeded: ${bluetoothResult.message}",
                mayHaveExecuted = true,
                drawerOpened = openDrawerAfterPrint
            )
        }

        Log.w(TAG, "${buildDiagnosticMessage(baseMessage)} | Bluetooth fallback failed: ${bluetoothResult.message}")
        return DrawerCommandResult(
            success = false,
            message = baseMessage,
            mayHaveExecuted = bluetoothResult.mayHaveExecuted
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
        private const val PRINT_CALLBACK_TIMEOUT_MS = 8_000L
        private const val BUILT_IN_LOGO_ALIGNMENT_CENTER = 1
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
