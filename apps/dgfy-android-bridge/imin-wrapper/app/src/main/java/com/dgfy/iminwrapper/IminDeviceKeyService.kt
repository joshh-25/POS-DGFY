package com.dgfy.iminwrapper

import android.content.Context
import android.os.Build
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyInfo
import android.security.keystore.KeyProperties
import org.json.JSONObject
import java.security.KeyFactory
import java.security.KeyPair
import java.security.KeyPairGenerator
import java.security.KeyStore
import java.security.MessageDigest
import java.security.PrivateKey
import java.security.Signature
import java.security.spec.ECGenParameterSpec
import java.security.spec.KeySpec
import java.util.Base64
import java.util.UUID

/**
 * Owns the per-install POS proof identity. The private key is generated and
 * used inside Android Keystore and is never serialized into a WebView,
 * preference, log, or API payload.
 */
class IminDeviceKeyService(context: Context) {
    data class Identity(
        val deviceId: String,
        val publicKey: String,
        val keyAlgorithm: String,
        val clientType: String,
        val publicKeyFingerprint: String,
        val securityLevel: String,
        val hardwareBacked: Boolean,
        val attestationStatus: String,
        val reenrollmentRequired: Boolean
    )

    data class SignedProof(
        val identity: Identity,
        val request: PosDeviceProofProtocol.SigningRequest,
        val canonicalRequest: String,
        val signature: String
    )

    private val appContext = context.applicationContext
    private val lock = Any()
    private val preferences = appContext.getSharedPreferences(PREFERENCES_NAME, Context.MODE_PRIVATE)

    fun getIdentity(): Identity = synchronized(lock) {
        loadOrCreateIdentity()
    }

    fun sign(message: JSONObject): SignedProof = synchronized(lock) {
        val identity = loadOrCreateIdentity()
        if (identity.reenrollmentRequired) {
            throw PosDeviceProofProtocol.ProtocolException(
                "REENROLLMENT_REQUIRED",
                "This installation must be enrolled again before it can sign POS requests."
            )
        }
        val request = PosDeviceProofProtocol.parseSigningRequest(message, identity.deviceId)
        val keyPair = readKeyPair()
            ?: throw PosDeviceProofProtocol.ProtocolException(
                "KEY_UNAVAILABLE",
                "The secure device key is unavailable; reenrollment is required."
            )
        val canonicalRequest = PosDeviceProofProtocol.canonicalRequest(request)
        val signature = runCatching {
            Signature.getInstance("SHA256withECDSA").apply {
                initSign(keyPair.private)
                update(canonicalRequest.toByteArray(Charsets.UTF_8))
            }.sign()
        }.getOrElse {
            throw PosDeviceProofProtocol.ProtocolException(
                "SIGNING_FAILED",
                "The secure device proof could not be created."
            )
        }
        SignedProof(
            identity = identity,
            request = request,
            canonicalRequest = canonicalRequest,
            signature = Base64.getUrlEncoder().withoutPadding().encodeToString(signature)
        )
    }

    /** Clears only the local diagnostic flag after the server accepts activation. */
    fun markEnrollmentComplete() {
        synchronized(lock) {
            preferences.edit().putBoolean(KEY_REENROLLMENT_REQUIRED, false).apply()
        }
    }

    fun handleMessage(message: JSONObject): JSONObject {
        val requestId = message.optString("id", "").trim().takeIf { it.length <= MAX_REQUEST_ID }.orEmpty()
        return try {
            when (message.optString("type", "").trim()) {
                "get_identity" -> {
                    requireMessageKeys(message, setOf("id", "type"))
                    success(requestId, identityJson(getIdentity()))
                }
                "sign" -> {
                    requireMessageKeys(message, setOf("id", "type", "request"))
                    val request = message.optJSONObject("request")
                        ?: throw PosDeviceProofProtocol.ProtocolException(
                            "MALFORMED_REQUEST",
                            "A typed signing request is required."
                        )
                    val signed = sign(request)
                    success(requestId, JSONObject()
                        .put("device_id", signed.identity.deviceId)
                        .put("signature", signed.signature)
                        .put("key_algorithm", signed.identity.keyAlgorithm)
                        .put("public_key_fingerprint", signed.identity.publicKeyFingerprint)
                        .put("security_level", signed.identity.securityLevel)
                        .put("hardware_backed", signed.identity.hardwareBacked)
                        .put("attestation_status", signed.identity.attestationStatus))
                }
                "mark_enrollment_complete" -> {
                    requireMessageKeys(message, setOf("id", "type"))
                    markEnrollmentComplete()
                    success(requestId, JSONObject().put("reenrollment_required", false))
                }
                else -> failure(requestId, "UNSUPPORTED_OPERATION", "The device proof operation is not supported.")
            }
        } catch (error: PosDeviceProofProtocol.ProtocolException) {
            failure(requestId, error.code, error.message)
        } catch (_: Exception) {
            failure(requestId, "DEVICE_PROOF_UNAVAILABLE", "The device proof service is unavailable.")
        }
    }

    private fun loadOrCreateIdentity(): Identity {
        val storedDeviceId = preferences.getString(KEY_DEVICE_ID, null)?.trim().orEmpty()
        val storedFingerprint = preferences.getString(KEY_FINGERPRINT, null)?.trim().orEmpty()
        val currentKeyPair = readKeyPair()
        val hadPriorState = storedDeviceId.isNotEmpty() || storedFingerprint.isNotEmpty() || currentKeyPair != null

        if (currentKeyPair == null || storedDeviceId.isEmpty()) {
            return createIdentity(reenrollmentRequired = hadPriorState)
        }

        val publicKey = encodePublicKey(currentKeyPair)
        val fingerprint = fingerprint(currentKeyPair)
        if (storedFingerprint.isNotEmpty() && storedFingerprint != fingerprint) {
            return createIdentity(reenrollmentRequired = true)
        }

        return buildIdentity(
            deviceId = storedDeviceId,
            publicKey = publicKey,
            fingerprint = fingerprint,
            privateKey = currentKeyPair.private,
            reenrollmentRequired = preferences.getBoolean(KEY_REENROLLMENT_REQUIRED, false)
        )
    }

    private fun createIdentity(reenrollmentRequired: Boolean): Identity {
        deleteKey()
        val keyPair = runCatching { generateKeyPair() }.getOrElse {
            throw IllegalStateException("Secure device identity unavailable.")
        }
        val deviceId = "imin-${UUID.randomUUID()}"
        val fingerprint = fingerprint(keyPair)
        preferences.edit()
            .putString(KEY_DEVICE_ID, deviceId)
            .putString(KEY_FINGERPRINT, fingerprint)
            .putBoolean(KEY_REENROLLMENT_REQUIRED, reenrollmentRequired)
            .apply()
        return buildIdentity(
            deviceId = deviceId,
            publicKey = encodePublicKey(keyPair),
            fingerprint = fingerprint,
            privateKey = keyPair.private,
            reenrollmentRequired = reenrollmentRequired
        )
    }

    private fun buildIdentity(
        deviceId: String,
        publicKey: String,
        fingerprint: String,
        privateKey: PrivateKey,
        reenrollmentRequired: Boolean
    ): Identity {
        val security = inspectSecurity(privateKey)
        return Identity(
            deviceId = deviceId,
            publicKey = publicKey,
            keyAlgorithm = PosDeviceProofProtocol.KEY_ALGORITHM,
            clientType = PosDeviceProofProtocol.CLIENT_TYPE,
            publicKeyFingerprint = fingerprint,
            securityLevel = security.first,
            hardwareBacked = security.second,
            // Attestation is intentionally not requested until a target iMin
            // model is validated. This avoids claiming universal attestation.
            attestationStatus = "not_requested",
            reenrollmentRequired = reenrollmentRequired
        )
    }

    private fun generateKeyPair(): KeyPair {
        val generator = KeyPairGenerator.getInstance(
            KeyProperties.KEY_ALGORITHM_EC,
            ANDROID_KEYSTORE
        )
        generator.initialize(
            KeyGenParameterSpec.Builder(
                KEY_ALIAS,
                KeyProperties.PURPOSE_SIGN or KeyProperties.PURPOSE_VERIFY
            )
                .setAlgorithmParameterSpec(ECGenParameterSpec("secp256r1"))
                .setDigests(KeyProperties.DIGEST_SHA256)
                .setUserAuthenticationRequired(false)
                .build()
        )
        return generator.generateKeyPair()
    }

    private fun readKeyPair(): KeyPair? {
        return runCatching {
            val keyStore = KeyStore.getInstance(ANDROID_KEYSTORE).apply { load(null) }
            val certificate = keyStore.getCertificate(KEY_ALIAS) ?: return@runCatching null
            val privateKey = keyStore.getKey(KEY_ALIAS, null) as? PrivateKey ?: return@runCatching null
            KeyPair(certificate.publicKey, privateKey)
        }.getOrNull()
    }

    private fun deleteKey() {
        runCatching {
            KeyStore.getInstance(ANDROID_KEYSTORE).apply {
                load(null)
                if (containsAlias(KEY_ALIAS)) deleteEntry(KEY_ALIAS)
            }
        }
    }

    private fun encodePublicKey(keyPair: KeyPair): String {
        return Base64.getEncoder().encodeToString(keyPair.public.encoded)
    }

    private fun fingerprint(keyPair: KeyPair): String {
        val digest = MessageDigest.getInstance("SHA-256").digest(keyPair.public.encoded)
        return digest.joinToString("") { byte -> "%02x".format(byte.toInt() and 0xff) }
    }

    private fun inspectSecurity(privateKey: PrivateKey): Pair<String, Boolean> {
        return runCatching {
            val factory = KeyFactory.getInstance(privateKey.algorithm, ANDROID_KEYSTORE)
            val spec: KeySpec = factory.getKeySpec(privateKey, KeyInfo::class.java)
            val info = spec as KeyInfo
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                val level = when (info.securityLevel) {
                    KeyProperties.SECURITY_LEVEL_STRONGBOX -> "strongbox"
                    KeyProperties.SECURITY_LEVEL_TRUSTED_ENVIRONMENT -> "trusted_environment"
                    KeyProperties.SECURITY_LEVEL_SOFTWARE -> "software"
                    else -> "unknown"
                }
                level to info.isInsideSecureHardware
            } else {
                if (info.isInsideSecureHardware) "trusted_environment" to true else "software" to false
            }
        }.getOrElse { "unknown" to false }
    }

    private fun identityJson(identity: Identity): JSONObject {
        return JSONObject()
            .put("device_id", identity.deviceId)
            .put("public_key", identity.publicKey)
            .put("key_algorithm", identity.keyAlgorithm)
            .put("client_type", identity.clientType)
            .put("public_key_fingerprint", identity.publicKeyFingerprint)
            .put("security_level", identity.securityLevel)
            .put("hardware_backed", identity.hardwareBacked)
            .put("attestation_status", identity.attestationStatus)
            .put("reenrollment_required", identity.reenrollmentRequired)
    }

    private fun requireMessageKeys(message: JSONObject, allowed: Set<String>) {
        message.keys().forEach { key ->
            if (!allowed.contains(key)) {
                throw PosDeviceProofProtocol.ProtocolException(
                    "MALFORMED_REQUEST",
                    "The device proof request contains an unsupported field."
                )
            }
        }
    }

    private fun success(requestId: String, data: JSONObject): JSONObject {
        return JSONObject()
            .put("id", requestId)
            .put("success", true)
            .put("data", data)
    }

    private fun failure(requestId: String, code: String, message: String): JSONObject {
        return JSONObject()
            .put("id", requestId)
            .put("success", false)
            .put("error_code", code)
            .put("message", message)
    }

    companion object {
        private const val ANDROID_KEYSTORE = "AndroidKeyStore"
        private const val KEY_ALIAS = "dgfy_pos_device_es256_v1"
        private const val PREFERENCES_NAME = "pos_device_identity"
        private const val KEY_DEVICE_ID = "device_id"
        private const val KEY_FINGERPRINT = "public_key_fingerprint"
        private const val KEY_REENROLLMENT_REQUIRED = "reenrollment_required"
        private const val MAX_REQUEST_ID = 128
    }
}
