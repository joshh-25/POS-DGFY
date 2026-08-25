package com.dgfy.iminwrapper

import android.Manifest
import android.annotation.SuppressLint
import android.bluetooth.BluetoothAdapter
import android.bluetooth.BluetoothClass
import android.bluetooth.BluetoothDevice
import android.content.Context
import android.content.pm.PackageManager
import android.os.Build
import android.os.SystemClock
import android.util.Log
import androidx.core.content.ContextCompat
import org.json.JSONArray
import org.json.JSONObject
import java.io.IOException
import java.util.UUID
import java.util.concurrent.ExecutionException
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit
import java.util.concurrent.TimeoutException
import java.util.concurrent.atomic.AtomicBoolean

class BluetoothEscPosController(
    private val context: Context,
    private val logoProvider: ReceiptLogoProvider = ReceiptLogoProvider(context.applicationContext)
) {
    private val appContext = context.applicationContext

    @Volatile
    private var lastAttemptedDevice = ""
    @Volatile
    private var lastSuccessDevice = ""
    @Volatile
    private var lastErrorClass = ""
    @Volatile
    private var lastErrorMessage = ""
    @Volatile
    private var lastPairedCount = 0
    @Volatile
    private var lastPrinterCandidateCount = 0

    fun openDrawer(): BluetoothCommandResult {
        return sendToFirstPrinterLikeDevice(
            bytes = DRAWER_KICK_BYTES,
            successMessage = "Bluetooth ESC/POS drawer pulse sent"
        )
    }

    fun openDrawerWithPulse(label: String, bytes: ByteArray): BluetoothCommandResult {
        return sendToFirstPrinterLikeDevice(
            bytes = bytes,
            successMessage = "Bluetooth drawer pulse $label sent"
        )
    }

    fun printReceipt(
        receiptText: String,
        openDrawerAfterPrint: Boolean,
        logoSource: String = ""
    ): BluetoothCommandResult {
        val normalizedText = receiptText.trim()
        if (normalizedText.isEmpty()) {
            return BluetoothCommandResult(false, "Receipt text is empty")
        }

        val payload = mutableListOf<Byte>()
        payload.addAll(INIT_PRINTER_BYTES.toList())
        // Resolves the tenant's configured company icon when logoSource is reachable,
        // falling back to the bundled DGFY drawable otherwise -- see issue #321.
        // Previously this always printed the bundled drawable regardless of branding.
        logoProvider.resolveRasterBytes(logoSource)?.let { logoBytes ->
            payload.addAll(ALIGN_CENTER_BYTES.toList())
            payload.addAll(logoBytes.toList())
            payload.addAll(byteArrayOf(0x0A, 0x0A).toList())
            payload.addAll(ALIGN_LEFT_BYTES.toList())
        }
        payload.addAll(normalizedText.toByteArray(Charsets.UTF_8).toList())
        payload.addAll(byteArrayOf(0x0A, 0x0A, 0x0A).toList())
        payload.addAll(PARTIAL_CUT_BYTES.toList())
        if (openDrawerAfterPrint) {
            payload.addAll(DRAWER_KICK_BYTES.toList())
        }

        return sendToFirstPrinterLikeDevice(
            bytes = payload.toByteArray(),
            successMessage = if (openDrawerAfterPrint) {
                "Bluetooth receipt sent and ESC/POS drawer pulse sent"
            } else {
                "Bluetooth receipt sent"
            }
        )
    }

    fun diagnosticsJson(): JSONObject {
        val devices = JSONArray()
        val pairedDevices = pairedDevicesOrEmpty()
        pairedDevices.forEach { device ->
            devices.put(
                JSONObject()
                    .put("name", safeDeviceName(device))
                    .put("address", safeDeviceAddress(device))
                    .put("majorClass", device.bluetoothClass?.majorDeviceClass ?: -1)
                    .put("deviceClass", device.bluetoothClass?.deviceClass ?: -1)
                    .put("printerCandidate", isPrinterLikeDevice(device))
            )
        }

        return JSONObject()
            .put("permissionGranted", hasBluetoothConnectPermission())
            .put("adapterAvailable", bluetoothAdapterOrNull() != null)
            .put("adapterEnabled", bluetoothAdapterOrNull()?.isEnabled == true)
            .put("pairedCount", pairedDevices.size)
            .put("printerCandidateCount", pairedDevices.count { isPrinterLikeDevice(it) })
            .put("lastAttemptedDevice", lastAttemptedDevice)
            .put("lastSuccessDevice", lastSuccessDevice)
            .put("lastErrorClass", lastErrorClass)
            .put("lastErrorMessage", lastErrorMessage)
            .put("pairedDevices", devices)
    }

    @SuppressLint("MissingPermission")
    private fun sendToFirstPrinterLikeDevice(
        bytes: ByteArray,
        successMessage: String
    ): BluetoothCommandResult {
        if (!hasBluetoothConnectPermission()) {
            lastErrorClass = "BluetoothPermissionMissing"
            lastErrorMessage = "Bluetooth permission is not granted"
            return BluetoothCommandResult(false, lastErrorMessage)
        }

        val adapter = bluetoothAdapterOrNull()
        if (adapter == null) {
            lastErrorClass = "BluetoothUnavailable"
            lastErrorMessage = "Bluetooth adapter is not available"
            return BluetoothCommandResult(false, lastErrorMessage)
        }

        if (!adapter.isEnabled) {
            lastErrorClass = "BluetoothDisabled"
            lastErrorMessage = "Bluetooth is disabled"
            return BluetoothCommandResult(false, lastErrorMessage)
        }

        val pairedDevices = pairedDevicesOrEmpty()
        lastPairedCount = pairedDevices.size
        if (pairedDevices.isEmpty()) {
            lastErrorClass = "NoPairedBluetoothDevices"
            lastErrorMessage = "No paired Bluetooth devices found"
            return BluetoothCommandResult(false, lastErrorMessage)
        }

        val orderedDevices = pairedDevices.filter { isPrinterLikeDevice(it) }
        lastPrinterCandidateCount = orderedDevices.size
        if (orderedDevices.isEmpty()) {
            lastErrorClass = "NoPairedBluetoothPrinters"
            lastErrorMessage = "No paired Bluetooth receipt printer found"
            return BluetoothCommandResult(false, lastErrorMessage)
        }

        val deadlineMs = SystemClock.elapsedRealtime() + TOTAL_SEND_TIMEOUT_MS
        var finalError: Throwable? = null
        var mayHaveExecuted = false

        for (device in orderedDevices) {
            lastAttemptedDevice = safeDeviceLabel(device)
            val remainingMs = deadlineMs - SystemClock.elapsedRealtime()
            if (remainingMs <= 0L) {
                finalError = TimeoutException("Bluetooth receipt printer deadline exceeded")
                break
            }
            try {
                adapter.cancelDiscovery()
                val attempt = sendWithTimeout(
                    device = device,
                    bytes = bytes,
                    timeoutMs = minOf(PER_DEVICE_SEND_TIMEOUT_MS, remainingMs)
                )
                mayHaveExecuted = mayHaveExecuted || attempt.mayHaveExecuted
                if (attempt.success) {
                    lastSuccessDevice = lastAttemptedDevice
                    lastErrorClass = ""
                    lastErrorMessage = ""
                    return BluetoothCommandResult(true, "$successMessage via $lastSuccessDevice", true)
                }
                finalError = attempt.error
                // A timeout after connect/write has an uncertain physical outcome.
                // Do not try another printer and risk a duplicate receipt/drawer pulse.
                if (attempt.mayHaveExecuted) break
            } catch (exception: IOException) {
                finalError = exception
            } catch (exception: RuntimeException) {
                finalError = exception
            }
        }

        lastErrorClass = finalError?.javaClass?.name ?: "BluetoothSendFailed"
        lastErrorMessage = finalError?.message ?: "Failed to send Bluetooth ESC/POS command"
        // pairedCount/lastAttemptedDevice already surface separately via
        // diagnosticsJson() -- no need to also append them to the message
        // DrawerController folds into its own diagnostic dump (or, now, no
        // longer does; see DrawerController.printReceipt).
        Log.w(TAG, "$lastErrorMessage | pairedCount=$lastPairedCount, printerCandidates=$lastPrinterCandidateCount, lastAttempted=$lastAttemptedDevice")
        return BluetoothCommandResult(false, lastErrorMessage, mayHaveExecuted)
    }

    @SuppressLint("MissingPermission")
    private fun sendWithTimeout(
        device: BluetoothDevice,
        bytes: ByteArray,
        timeoutMs: Long
    ): SendAttemptResult {
        val socket = device.createRfcommSocketToServiceRecord(SPP_UUID)
        val executor = Executors.newSingleThreadExecutor()
        val commandMayHaveExecuted = AtomicBoolean(false)
        val future = executor.submit<Unit> {
            socket.use {
                it.connect()
                it.outputStream.use { outputStream ->
                    commandMayHaveExecuted.set(true)
                    outputStream.write(bytes)
                    outputStream.flush()
                }
            }
        }

        return try {
            future.get(timeoutMs.coerceAtLeast(1L), TimeUnit.MILLISECONDS)
            SendAttemptResult(success = true, mayHaveExecuted = true)
        } catch (exception: TimeoutException) {
            runCatching { socket.close() }
            future.cancel(true)
            SendAttemptResult(success = false, mayHaveExecuted = true, error = exception)
        } catch (exception: InterruptedException) {
            Thread.currentThread().interrupt()
            runCatching { socket.close() }
            future.cancel(true)
            SendAttemptResult(success = false, mayHaveExecuted = true, error = exception)
        } catch (exception: ExecutionException) {
            SendAttemptResult(
                success = false,
                mayHaveExecuted = commandMayHaveExecuted.get(),
                error = exception.cause ?: exception
            )
        } finally {
            executor.shutdownNow()
        }
    }

    private fun pairedDevicesOrEmpty(): Set<BluetoothDevice> {
        if (!hasBluetoothConnectPermission()) {
            return emptySet()
        }

        return try {
            bluetoothAdapterOrNull()?.bondedDevices ?: emptySet()
        } catch (exception: SecurityException) {
            lastErrorClass = exception.javaClass.name
            lastErrorMessage = exception.message ?: "Bluetooth permission denied"
            emptySet()
        }
    }

    private fun hasBluetoothConnectPermission(): Boolean {
        return Build.VERSION.SDK_INT < Build.VERSION_CODES.S ||
            ContextCompat.checkSelfPermission(
                appContext,
                Manifest.permission.BLUETOOTH_CONNECT
            ) == PackageManager.PERMISSION_GRANTED
    }

    @Suppress("DEPRECATION")
    private fun bluetoothAdapterOrNull(): BluetoothAdapter? = BluetoothAdapter.getDefaultAdapter()

    @SuppressLint("MissingPermission")
    private fun isPrinterLikeDevice(device: BluetoothDevice): Boolean {
        val name = safeDeviceName(device).lowercase()
        val majorClass = device.bluetoothClass?.majorDeviceClass
        return majorClass == BluetoothClass.Device.Major.IMAGING ||
            name.contains("printer") ||
            name.contains("pos") ||
            name.contains("imin") ||
            name.contains("receipt")
    }

    @SuppressLint("MissingPermission")
    private fun safeDeviceName(device: BluetoothDevice): String {
        return try {
            device.name ?: ""
        } catch (exception: SecurityException) {
            ""
        }
    }

    @SuppressLint("MissingPermission")
    private fun safeDeviceAddress(device: BluetoothDevice): String {
        return try {
            device.address ?: ""
        } catch (exception: SecurityException) {
            ""
        }
    }

    private fun safeDeviceLabel(device: BluetoothDevice): String {
        val name = safeDeviceName(device)
        val address = safeDeviceAddress(device)
        return listOf(name, address).filter { it.isNotBlank() }.joinToString(" ")
    }

    data class BluetoothCommandResult(
        val success: Boolean,
        val message: String,
        val mayHaveExecuted: Boolean = false
    )

    private data class SendAttemptResult(
        val success: Boolean,
        val mayHaveExecuted: Boolean,
        val error: Throwable? = null
    )

    companion object {
        private const val TAG = "BluetoothEscPosController"
        private const val PER_DEVICE_SEND_TIMEOUT_MS = 4_000L
        private const val TOTAL_SEND_TIMEOUT_MS = 10_000L
        private val SPP_UUID: UUID = UUID.fromString("00001101-0000-1000-8000-00805F9B34FB")
        private val INIT_PRINTER_BYTES = byteArrayOf(0x1B, 0x40)
        private val ALIGN_CENTER_BYTES = byteArrayOf(0x1B, 0x61, 0x01)
        private val ALIGN_LEFT_BYTES = byteArrayOf(0x1B, 0x61, 0x00)
        private val PARTIAL_CUT_BYTES = byteArrayOf(0x1D, 0x56, 0x42, 0x00)
        private val DRAWER_KICK_BYTES = byteArrayOf(0x10, 0x14, 0x00, 0x00, 0x00)
    }
}
