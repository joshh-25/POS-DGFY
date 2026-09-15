package com.dgfy.iminwrapper

import org.json.JSONArray
import org.json.JSONObject
import java.net.URLDecoder
import java.nio.charset.StandardCharsets
import java.security.MessageDigest
import java.util.Locale

/** Android implementation of the API's canonical POS device proof contract. */
object PosDeviceProofProtocol {
    const val KEY_ALGORITHM = "ES256"
    const val CLIENT_TYPE = "android"
    const val PURPOSE_SESSION = "session"
    const val PURPOSE_REQUEST = "request"

    private const val MAX_MESSAGE_FIELD = 512
    private const val MAX_PATH_INPUT = 2_048
    private const val MAX_CANONICAL_PATH = 255
    private val DEVICE_ID_PATTERN = Regex("^[A-Za-z0-9][A-Za-z0-9._:-]{1,159}$")
    private val TERMINAL_ID_PATTERN = Regex("^[A-Za-z0-9._-]{2,100}$")
    private val METHOD_PATTERN = Regex("^[A-Z]{3,12}$")

    data class SigningRequest(
        val tenantId: String,
        val terminalId: String,
        val locationId: Int?,
        val deviceId: String,
        val purpose: String,
        val sessionId: String,
        val challenge: String,
        val method: String,
        val path: String,
        val body: Any?
    )

    class ProtocolException(
        val code: String,
        override val message: String
    ) : IllegalArgumentException(message)

    fun parseSigningRequest(message: JSONObject, expectedDeviceId: String): SigningRequest {
        requireKeys(message, setOf("tenant_id", "terminal_id", "location_id", "device_id", "purpose", "session_id", "challenge", "method", "path", "body"))
        val tenantId = requiredText(message, "tenant_id", MAX_MESSAGE_FIELD)
        val terminalId = requiredText(message, "terminal_id", 100).uppercase(Locale.US)
        if (!TERMINAL_ID_PATTERN.matches(terminalId)) {
            throw ProtocolException("INVALID_TERMINAL", "The terminal binding is invalid.")
        }
        val locationId = optionalPositiveInt(message, "location_id")
        val deviceId = requiredText(message, "device_id", 160)
        if (!DEVICE_ID_PATTERN.matches(deviceId) || deviceId != expectedDeviceId) {
            throw ProtocolException("DEVICE_MISMATCH", "The device binding is invalid.")
        }
        val purpose = requiredText(message, "purpose", 32).lowercase(Locale.US)
        if (purpose != PURPOSE_SESSION && purpose != PURPOSE_REQUEST) {
            throw ProtocolException("INVALID_PURPOSE", "The proof purpose is invalid.")
        }
        val sessionId = requiredText(message, "session_id", 128)
        val challenge = requiredText(message, "challenge", MAX_MESSAGE_FIELD)
        val method = requiredText(message, "method", 12).uppercase(Locale.US)
        if (!METHOD_PATTERN.matches(method)) {
            throw ProtocolException("INVALID_METHOD", "The request method is invalid.")
        }
        val path = canonicalRequestPath(requiredText(message, "path", MAX_PATH_INPUT))
        if (!isApprovedSigningPath(path)) {
            throw ProtocolException("PATH_NOT_APPROVED", "This request path is not approved for device signing.")
        }
        val body = if (message.has("body") && !message.isNull("body")) message.get("body") else null
        validateJsonValue(body)
        return SigningRequest(
            tenantId = tenantId,
            terminalId = terminalId,
            locationId = locationId,
            deviceId = deviceId,
            purpose = purpose,
            sessionId = sessionId,
            challenge = challenge,
            method = method,
            path = path,
            body = body
        )
    }

    fun canonicalRequest(request: SigningRequest): String {
        val bodyDigest = sha256Hex(stableJson(request.body))
        return buildString {
            // Keys are alphabetical, matching server stableStringify output.
            append('{')
            appendJsonField("body_sha256", bodyDigest)
            append(',')
            appendJsonField("challenge", request.challenge)
            append(',')
            appendJsonField("device_id", request.deviceId)
            append(',')
            append("\"location_id\":")
            if (request.locationId == null) append("null") else append(request.locationId)
            append(',')
            appendJsonField("method", request.method)
            append(',')
            appendJsonField("path", request.path)
            append(',')
            appendJsonField("purpose", request.purpose)
            append(',')
            appendJsonField("session_id", request.sessionId)
            append(',')
            appendJsonField("tenant_id", request.tenantId)
            append(',')
            appendJsonField("terminal_id", request.terminalId)
            append(',')
            append("\"version\":1")
            append('}')
        }
    }

    fun canonicalRequestPath(rawPath: String): String {
        val raw = rawPath.trim()
        if (raw.isEmpty() || raw.length > MAX_PATH_INPUT || raw.any(Char::isISOControl) || !raw.startsWith('/')) {
            throw ProtocolException("INVALID_PATH", "The request path is invalid.")
        }
        val queryIndex = raw.indexOf('?')
        val path = if (queryIndex >= 0) raw.substring(0, queryIndex) else raw
        val rawQuery = if (queryIndex >= 0) raw.substring(queryIndex + 1) else ""
        val canonicalQuery = if (rawQuery.isEmpty()) {
            ""
        } else {
            rawQuery.split('&')
                .filter { it.isNotEmpty() }
                .map { pair ->
                    val separator = pair.indexOf('=')
                    val rawKey = if (separator >= 0) pair.substring(0, separator) else pair
                    val rawValue = if (separator >= 0) pair.substring(separator + 1) else ""
                    decodeQueryPart(rawKey) to decodeQueryPart(rawValue)
                }
                .sortedWith(compareBy<Pair<String, String>> { it.first }.thenBy { it.second })
                .joinToString("&") { (key, value) -> "${encodeQueryPart(key)}=${encodeQueryPart(value)}" }
        }
        val canonical = if (canonicalQuery.isEmpty()) path else "$path?$canonicalQuery"
        if (canonical.length > MAX_CANONICAL_PATH) {
            throw ProtocolException("INVALID_PATH", "The request path is too long.")
        }
        return canonical
    }

    fun isApprovedSigningPath(path: String): Boolean {
        if (path == "/api/v1/auth/refresh" || path == "/api/v1/auth/logout") return true
        if (path.startsWith("/api/v1/pos/terminal/devices")) return false
        if (path.startsWith("/api/v1/pos/")) return true
        return Regex("^/api/v1/dgfy/account/companies/[^/]+/pos-session(?:\\?.*)?$").matches(path)
    }

    fun stableJson(value: Any?): String {
        return when (value) {
            null, JSONObject.NULL -> "null"
            is JSONObject -> value.keys().asSequence().toList().sorted().joinToString(separator = ",", prefix = "{", postfix = "}") { key ->
                "${JSONObject.quote(key)}:${stableJson(value.get(key))}"
            }
            is JSONArray -> (0 until value.length()).joinToString(separator = ",", prefix = "[", postfix = "]") { index ->
                stableJson(value.opt(index))
            }
            is String -> JSONObject.quote(value)
            is Boolean -> value.toString()
            is Number -> JSONObject.numberToString(value)
            else -> throw ProtocolException("INVALID_JSON", "The request body contains an unsupported value.")
        }
    }

    fun sha256Hex(value: String): String {
        val digest = MessageDigest.getInstance("SHA-256").digest(value.toByteArray(StandardCharsets.UTF_8))
        return digest.joinToString("") { byte -> "%02x".format(Locale.US, byte.toInt() and 0xff) }
    }

    private fun requireKeys(message: JSONObject, allowed: Set<String>) {
        message.keys().forEach { key ->
            if (!allowed.contains(key)) {
                throw ProtocolException("MALFORMED_REQUEST", "The signing request contains an unsupported field.")
            }
        }
    }

    private fun requiredText(message: JSONObject, key: String, maxLength: Int): String {
        if (!message.has(key) || message.isNull(key)) {
            throw ProtocolException("MALFORMED_REQUEST", "The signing request is incomplete.")
        }
        val value = message.optString(key, "").trim()
        if (value.isEmpty() || value.length > maxLength || value.any(Char::isISOControl)) {
            throw ProtocolException("MALFORMED_REQUEST", "The signing request contains an invalid field.")
        }
        return value
    }

    private fun optionalPositiveInt(message: JSONObject, key: String): Int? {
        if (!message.has(key) || message.isNull(key)) return null
        val value = message.opt(key)
        val number = value as? Number
            ?: throw ProtocolException("INVALID_LOCATION", "The location binding is invalid.")
        val intValue = number.toInt()
        if (number.toDouble() != intValue.toDouble() || intValue <= 0) {
            throw ProtocolException("INVALID_LOCATION", "The location binding is invalid.")
        }
        return intValue
    }

    private fun validateJsonValue(value: Any?) {
        when (value) {
            null, JSONObject.NULL, is String, is Boolean, is Number -> Unit
            is JSONObject -> value.keys().forEach { key ->
                if (key.any(Char::isISOControl)) throw ProtocolException("INVALID_JSON", "The request body is invalid.")
                validateJsonValue(value.get(key))
            }
            is JSONArray -> (0 until value.length()).forEach { index -> validateJsonValue(value.opt(index)) }
            else -> throw ProtocolException("INVALID_JSON", "The request body is invalid.")
        }
    }

    private fun decodeQueryPart(value: String): String {
        return runCatching { URLDecoder.decode(value, StandardCharsets.UTF_8.name()) }
            .getOrElse { throw ProtocolException("INVALID_PATH", "The request query is invalid.") }
    }

    private fun encodeQueryPart(value: String): String {
        val bytes = value.toByteArray(StandardCharsets.UTF_8)
        val builder = StringBuilder()
        bytes.forEach { byte ->
            val unsigned = byte.toInt() and 0xff
            val character = unsigned.toChar()
            if (character in 'a'..'z' || character in 'A'..'Z' || character in '0'..'9' || character in "-._!~*'()") {
                builder.append(character)
            } else {
                builder.append('%')
                builder.append("0123456789ABCDEF"[unsigned ushr 4])
                builder.append("0123456789ABCDEF"[unsigned and 0x0f])
            }
        }
        return builder.toString()
    }

    private fun StringBuilder.appendJsonField(key: String, value: String) {
        append(JSONObject.quote(key))
        append(':')
        append(JSONObject.quote(value))
    }
}
