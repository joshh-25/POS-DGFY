package com.dgfy.iminwrapper

import android.Manifest
import android.annotation.SuppressLint
import android.bluetooth.BluetoothAdapter
import android.bluetooth.BluetoothClass
import android.bluetooth.BluetoothDevice
import android.content.Context
import android.content.pm.PackageManager
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Color
import android.os.Build
import androidx.core.content.ContextCompat
import org.json.JSONArray
import org.json.JSONObject
import java.io.ByteArrayOutputStream
import java.io.IOException
import java.util.UUID
import kotlin.math.roundToInt

class BluetoothEscPosController(
    private val context: Context
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

    fun printReceipt(receiptText: String, openDrawerAfterPrint: Boolean): BluetoothCommandResult {
        val normalizedText = receiptText.trim()
        if (normalizedText.isEmpty()) {
            return BluetoothCommandResult(false, "Receipt text is empty")
        }

        val payload = mutableListOf<Byte>()
        payload.addAll(INIT_PRINTER_BYTES.toList())
        receiptLogoRasterBytes()?.let { logoBytes ->
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

    private fun receiptLogoRasterBytes(): ByteArray? {
        val source = BitmapFactory.decodeResource(appContext.resources, R.drawable.dgfy_receipt_logo)
            ?: return null
        val scaled = scaleBitmapToWidth(source, RECEIPT_LOGO_WIDTH_DOTS)
        if (scaled !== source) {
            source.recycle()
        }

        return try {
            bitmapToEscPosRaster(scaled)
        } finally {
            scaled.recycle()
        }
    }

    private fun scaleBitmapToWidth(source: Bitmap, targetWidth: Int): Bitmap {
        if (source.width <= 0 || source.height <= 0 || source.width == targetWidth) {
            return source
        }

        val ratio = targetWidth.toDouble() / source.width.toDouble()
        val targetHeight = (source.height * ratio).roundToInt().coerceAtLeast(1)
        return Bitmap.createScaledBitmap(source, targetWidth, targetHeight, true)
    }

    private fun bitmapToEscPosRaster(bitmap: Bitmap): ByteArray {
        val widthBytes = (bitmap.width + 7) / 8
        val height = bitmap.height
        val imageBytes = ByteArray(widthBytes * height)

        for (y in 0 until height) {
            for (xByte in 0 until widthBytes) {
                var packed = 0
                for (bit in 0 until 8) {
                    val x = xByte * 8 + bit
                    if (x < bitmap.width && isDarkPixel(bitmap.getPixel(x, y))) {
                        packed = packed or (0x80 shr bit)
                    }
                }
                imageBytes[y * widthBytes + xByte] = packed.toByte()
            }
        }

        return ByteArrayOutputStream().use { output ->
            output.write(byteArrayOf(
                0x1D,
                0x76,
                0x30,
                0x00,
                (widthBytes and 0xFF).toByte(),
                ((widthBytes shr 8) and 0xFF).toByte(),
                (height and 0xFF).toByte(),
                ((height shr 8) and 0xFF).toByte()
            ))
            output.write(imageBytes)
            output.toByteArray()
        }
    }

    private fun isDarkPixel(pixel: Int): Boolean {
        val alpha = Color.alpha(pixel)
        if (alpha < 64) return false

        val red = Color.red(pixel)
        val green = Color.green(pixel)
        val blue = Color.blue(pixel)
        val luminance = (red * 0.299) + (green * 0.587) + (blue * 0.114)
        return luminance < 190
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
        private const val RECEIPT_LOGO_WIDTH_DOTS = 256
    }
}
