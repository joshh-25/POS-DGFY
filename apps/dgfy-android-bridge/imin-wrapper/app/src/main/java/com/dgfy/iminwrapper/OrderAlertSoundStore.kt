package com.dgfy.iminwrapper

import android.content.Context
import android.util.Base64
import org.json.JSONObject
import java.io.File

class OrderAlertSoundStore(context: Context) {
    private val soundDirectory = File(context.filesDir, "order-alert-sounds")

    fun save(soundType: String, base64Data: String, mimeType: String): String {
        val normalizedSoundType = soundType.trim()
        val isImportedSound = IMPORTED_SOUND_ID_PATTERN.matches(normalizedSoundType)
        if (!isImportedSound && !ALLOWED_SOUND_IDS.contains(normalizedSoundType)) {
            return result(false, "The selected order alert sound is not supported.")
        }
        val normalizedMimeType = mimeType.trim().lowercase()
        if (isImportedSound && normalizedMimeType !in MP3_MIME_TYPES) {
            return result(false, "Imported order alert sounds must use MP3 audio.")
        }
        if (!isImportedSound && normalizedMimeType != WAV_MIME_TYPE) {
            return result(false, "Only WAV order alert sounds are supported.")
        }
        if (base64Data.length > MAX_BASE64_LENGTH) {
            return result(false, "The order alert sound is too large.")
        }

        val bytes = try {
            Base64.decode(base64Data, Base64.DEFAULT)
        } catch (_: IllegalArgumentException) {
            return result(false, "The order alert sound data is invalid.")
        }
        val validAudio = if (isImportedSound) {
            bytes.size in MIN_MP3_BYTES..MAX_SOUND_BYTES && isMp3File(bytes)
        } else {
            bytes.size in MIN_WAV_BYTES..MAX_SOUND_BYTES && isWaveFile(bytes)
        }
        if (!validAudio) {
            return result(false, "The order alert sound file is invalid.")
        }

        return try {
            if (!soundDirectory.exists() && !soundDirectory.mkdirs()) {
                return result(false, "The device could not create local sound storage.")
            }
            val target = soundFile(normalizedSoundType)
            val temporary = File(soundDirectory, "${target.name}.tmp")
            temporary.outputStream().use { it.write(bytes) }
            if (target.exists() && !target.delete()) {
                temporary.delete()
                return result(false, "The device could not replace the order alert sound.")
            }
            if (!temporary.renameTo(target)) {
                temporary.delete()
                return result(false, "The device could not save the order alert sound.")
            }
            result(true, "Order alert sound saved on the device.")
        } catch (_: Exception) {
            result(false, "The device could not save the order alert sound.")
        }
    }

    fun fileFor(soundType: String): File? {
        val normalizedSoundType = soundType.trim()
        val isImportedSound = IMPORTED_SOUND_ID_PATTERN.matches(normalizedSoundType)
        if (!isImportedSound && !ALLOWED_SOUND_IDS.contains(normalizedSoundType)) return null
        val minimumBytes = if (isImportedSound) MIN_MP3_BYTES else MIN_WAV_BYTES
        return soundFile(normalizedSoundType).takeIf { it.isFile && it.length() in minimumBytes..MAX_SOUND_BYTES }
    }

    private fun soundFile(soundType: String): File = File(
        soundDirectory,
        if (IMPORTED_SOUND_ID_PATTERN.matches(soundType)) "$soundType.mp3" else "$soundType.wav"
    )

    private fun result(success: Boolean, message: String): String = JSONObject()
        .put("success", success)
        .put("message", message)
        .toString()

    private fun isWaveFile(bytes: ByteArray): Boolean {
        if (bytes.size < 12) return false
        return bytes.copyOfRange(0, 4).toString(Charsets.US_ASCII) == "RIFF"
            && bytes.copyOfRange(8, 12).toString(Charsets.US_ASCII) == "WAVE"
    }

    private fun isMp3File(bytes: ByteArray): Boolean {
        if (bytes.size < MIN_MP3_BYTES) return false
        if (bytes.size >= 3 && bytes.copyOfRange(0, 3).toString(Charsets.US_ASCII) == "ID3") return true

        val scanLimit = minOf(bytes.size - 1, 4096)
        for (index in 0 until scanLimit) {
            val firstByte = bytes[index].toInt() and 0xff
            val secondByte = bytes[index + 1].toInt() and 0xff
            if (firstByte == 0xff && (secondByte and 0xe0) == 0xe0) return true
        }
        return false
    }

    companion object {
        private const val WAV_MIME_TYPE = "audio/wav"
        private val MP3_MIME_TYPES = setOf("audio/mpeg", "audio/mp3")
        private const val MIN_WAV_BYTES = 44
        private const val MIN_MP3_BYTES = 2
        private const val MAX_SOUND_BYTES = 256 * 1024
        private const val MAX_BASE64_LENGTH = ((MAX_SOUND_BYTES + 2) / 3) * 4 + 16
        private val IMPORTED_SOUND_ID_PATTERN = Regex("^imported-[a-z0-9-]{8,80}$")
        private val ALLOWED_SOUND_IDS = setOf(
            "gentle-bell",
            "bright-ping",
            "two-note-ding",
            "calm-notification",
            "short-alert"
        )
    }
}
