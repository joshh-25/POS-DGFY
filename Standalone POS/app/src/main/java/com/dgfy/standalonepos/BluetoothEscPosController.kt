package com.dgfy.standalonepos

import android.Manifest
import android.annotation.SuppressLint
import android.bluetooth.BluetoothAdapter
import android.bluetooth.BluetoothClass
import android.bluetooth.BluetoothDevice
import android.content.Context
import android.content.pm.PackageManager
import android.os.Build
import androidx.core.content.ContextCompat
import org.json.JSONArray
import org.json.JSONObject
import java.io.IOException
import java.util.UUID

class BluetoothEscPosController(
    private val context: Context
) {
    private val appContext = context.applicationContext
    private val logoProvider = ReceiptLogoProvider(appContext)

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

    fun openDrawer(): BluetoothCommandResult {
        return sendToFirstPrinterLikeDevice(
            bytes = DRAWER_KICK_BYTES,
            successMessage = "Bluetooth ESC/POS drawer pulse sent"
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

        val orderedDevices = pairedDevices.sortedByDescending { isPrinterLikeDevice(it) }
        var finalError: Throwable? = null

        for (device in orderedDevices) {
            lastAttemptedDevice = safeDeviceLabel(device)
            try {
                adapter.cancelDiscovery()
                device.createRfcommSocketToServiceRecord(SPP_UUID).use { socket ->
                    socket.connect()
                    socket.outputStream.use { outputStream ->
                        outputStream.write(bytes)
                        outputStream.flush()
                    }
                }
                lastSuccessDevice = lastAttemptedDevice
                lastErrorClass = ""
                lastErrorMessage = ""
                return BluetoothCommandResult(true, "$successMessage via $lastSuccessDevice")
            } catch (exception: IOException) {
                finalError = exception
            } catch (exception: RuntimeException) {
                finalError = exception
            }
        }

        lastErrorClass = finalError?.javaClass?.name ?: "BluetoothSendFailed"
        lastErrorMessage = finalError?.message ?: "Failed to send Bluetooth ESC/POS command"
        return BluetoothCommandResult(
            false,
            "$lastErrorMessage | pairedCount=$lastPairedCount, lastAttempted=$lastAttemptedDevice"
        )
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
        } catch (_: SecurityException) {
            ""
        }
    }

    @SuppressLint("MissingPermission")
    private fun safeDeviceAddress(device: BluetoothDevice): String {
        return try {
            device.address ?: ""
        } catch (_: SecurityException) {
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
        val message: String
    )

    companion object {
        private val SPP_UUID: UUID = UUID.fromString("00001101-0000-1000-8000-00805F9B34FB")
        private val INIT_PRINTER_BYTES = byteArrayOf(0x1B, 0x40)
        private val ALIGN_CENTER_BYTES = byteArrayOf(0x1B, 0x61, 0x01)
        private val ALIGN_LEFT_BYTES = byteArrayOf(0x1B, 0x61, 0x00)
        private val PARTIAL_CUT_BYTES = byteArrayOf(0x1D, 0x56, 0x42, 0x00)
        private val DRAWER_KICK_BYTES = byteArrayOf(0x10, 0x14, 0x00, 0x00, 0x00)
    }
}
