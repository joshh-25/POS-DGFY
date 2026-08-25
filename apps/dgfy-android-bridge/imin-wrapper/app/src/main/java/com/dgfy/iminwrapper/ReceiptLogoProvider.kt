package com.dgfy.iminwrapper

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Color
import android.os.SystemClock
import android.util.Base64
import android.util.Log
import java.io.ByteArrayOutputStream
import java.net.HttpURLConnection
import java.net.URL
import kotlin.math.roundToInt

/**
 * Resolves the receipt header logo as ESC/POS raster bytes: the tenant's configured
 * company icon when [resolveRasterBytes] is given a reachable source, falling back to
 * the bundled DGFY drawable (R.drawable.dgfy_receipt_logo) only when [logoSource] is
 * blank or the fetch/decode fails. This replaces the previous behavior where
 * BluetoothEscPosController always printed the bundled drawable regardless of tenant
 * branding (see issue #321).
 *
 * Owns the bitmap -> GS v 0 raster encoding too (moved here from
 * BluetoothEscPosController), so every transport that wants a receipt logo shares one
 * encoder.
 */
class ReceiptLogoProvider(
    context: Context,
    private val clockMs: () -> Long = { SystemClock.elapsedRealtime() },
    private val downloadBitmap: (String) -> Bitmap? = ::defaultDownloadBitmap
) {
    private val appContext = context.applicationContext

    // Cache the encoded raster bytes, not the Bitmap -- avoids any bitmap-recycle
    // lifecycle question for a value that may be reused across many prints.
    private val successCache = TtlLruCache<String, ByteArray>(
        maxSize = CACHE_MAX_ENTRIES,
        ttlMs = POSITIVE_TTL_MS,
        clockMs = clockMs
    )

    // Built-in iMin printing accepts a Bitmap instead of ESC/POS raster bytes.
    // Cache a compact PNG representation and decode a caller-owned Bitmap for
    // each print so the caller can recycle it safely after the SDK call.
    private val bitmapCache = TtlLruCache<String, ByteArray>(
        maxSize = CACHE_MAX_ENTRIES,
        ttlMs = POSITIVE_TTL_MS,
        clockMs = clockMs
    )

    // Short negative cache so a broken/unreachable icon URL doesn't add a network
    // timeout to every single receipt for the rest of the shift.
    private val failureCache = TtlLruCache<String, Boolean>(
        maxSize = CACHE_MAX_ENTRIES,
        ttlMs = NEGATIVE_TTL_MS,
        clockMs = clockMs
    )

    // The bundled drawable never changes at runtime, so decode/scale/encode it once
    // instead of on every fallback (the pre-fix code re-decoded it on every print).
    private val fallbackRasterBytes: ByteArray? by lazy { decodeFallback() }
    private val fallbackBitmapBytes: ByteArray? by lazy { decodeFallbackBitmapBytes() }

    fun resolveRasterBytes(logoSource: String): ByteArray? {
        val trimmed = logoSource.trim()
        if (trimmed.isEmpty()) return fallbackRasterBytes

        successCache.get(trimmed)?.let { return it }
        bitmapCache.get(trimmed)?.let { encoded ->
            val bitmap = BitmapFactory.decodeByteArray(encoded, 0, encoded.size)
                ?: return@let
            val raster = try {
                bitmapToEscPosRaster(bitmap)
            } finally {
                bitmap.recycle()
            }
            successCache.put(trimmed, raster)
            return raster
        }
        if (failureCache.get(trimmed) == true) return fallbackRasterBytes

        val bitmap = try {
            downloadBitmap(trimmed)
        } catch (exception: Exception) {
            Log.w(TAG, "Failed to download receipt logo from $trimmed", exception)
            null
        }

        if (bitmap == null) {
            failureCache.put(trimmed, true)
            return fallbackRasterBytes
        }

        val raster = try {
            val scaled = scaleBitmapToWidth(bitmap, RECEIPT_LOGO_WIDTH_DOTS)
            try {
                bitmapToEscPosRaster(scaled)
            } finally {
                if (scaled !== bitmap) scaled.recycle()
            }
        } catch (exception: Exception) {
            Log.w(TAG, "Failed to encode receipt logo raster for $trimmed", exception)
            null
        } finally {
            bitmap.recycle()
        }

        if (raster == null) {
            failureCache.put(trimmed, true)
            return fallbackRasterBytes
        }

        successCache.put(trimmed, raster)
        return raster
    }

    fun resolveBitmap(logoSource: String): Bitmap? {
        val trimmed = logoSource.trim()
        val encoded = if (trimmed.isEmpty()) {
            fallbackBitmapBytes
        } else {
            bitmapCache.get(trimmed) ?: run {
                if (failureCache.get(trimmed) == true) return@run fallbackBitmapBytes
                val source = try {
                    downloadBitmap(trimmed)
                } catch (exception: Exception) {
                    Log.w(TAG, "Failed to download receipt logo from $trimmed", exception)
                    null
                }
                if (source == null) {
                    failureCache.put(trimmed, true)
                    return@run fallbackBitmapBytes
                }

                val scaled = scaleBitmapToWidth(source, RECEIPT_LOGO_WIDTH_DOTS)
                if (scaled !== source) source.recycle()
                val bytes = try {
                    bitmapToPngBytes(scaled)
                } finally {
                    scaled.recycle()
                }
                if (bytes == null) {
                    failureCache.put(trimmed, true)
                    fallbackBitmapBytes
                } else {
                    bitmapCache.put(trimmed, bytes)
                    bytes
                }
            }
        } ?: return null

        return BitmapFactory.decodeByteArray(encoded, 0, encoded.size)
    }

    private fun decodeFallback(): ByteArray? {
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

    private fun decodeFallbackBitmapBytes(): ByteArray? {
        val source = BitmapFactory.decodeResource(appContext.resources, R.drawable.dgfy_receipt_logo)
            ?: return null
        val scaled = scaleBitmapToWidth(source, RECEIPT_LOGO_WIDTH_DOTS)
        if (scaled !== source) source.recycle()
        return try {
            bitmapToPngBytes(scaled)
        } finally {
            scaled.recycle()
        }
    }

    companion object {
        private const val TAG = "ReceiptLogoProvider"
        private const val RECEIPT_LOGO_WIDTH_DOTS = 256
        private const val CACHE_MAX_ENTRIES = 4
        private const val POSITIVE_TTL_MS = 30 * 60 * 1000L
        private const val NEGATIVE_TTL_MS = 5 * 60 * 1000L
        private const val CONNECT_TIMEOUT_MS = 4_000
        private const val READ_TIMEOUT_MS = 4_000

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

        private fun bitmapToPngBytes(bitmap: Bitmap): ByteArray? =
            ByteArrayOutputStream().use { output ->
                if (!bitmap.compress(Bitmap.CompressFormat.PNG, 100, output)) return null
                output.toByteArray()
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

        // Default fetcher: http(s) URL or a data: URI (matching what
        // iminHardwareBridge.js's resolveReceiptLogoSource/resolveAssetUrl can send --
        // see that file's guard limiting it to absolute URLs). Any other scheme (e.g.
        // a page-scoped blob: URL, which can't be resolved outside the WebView
        // document) returns null and falls back to the bundled drawable.
        private fun defaultDownloadBitmap(source: String): Bitmap? {
            if (source.startsWith("data:")) {
                return decodeDataUri(source)
            }
            if (!source.startsWith("http://") && !source.startsWith("https://")) {
                return null
            }

            val connection = URL(source).openConnection() as? HttpURLConnection ?: return null
            return try {
                connection.connectTimeout = CONNECT_TIMEOUT_MS
                connection.readTimeout = READ_TIMEOUT_MS
                connection.instanceFollowRedirects = true
                connection.requestMethod = "GET"
                if (connection.responseCode !in 200..299) return null
                connection.inputStream.use { stream -> BitmapFactory.decodeStream(stream) }
            } finally {
                connection.disconnect()
            }
        }

        private fun decodeDataUri(dataUri: String): Bitmap? {
            val commaIndex = dataUri.indexOf(',')
            if (commaIndex < 0) return null

            val meta = dataUri.substring(5, commaIndex)
            val payload = dataUri.substring(commaIndex + 1)
            if (!meta.contains(";base64")) return null

            val bytes = Base64.decode(payload, Base64.DEFAULT)
            return BitmapFactory.decodeByteArray(bytes, 0, bytes.size)
        }
    }
}
