package com.dgfy.iminwrapper

import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import java.security.KeyPairGenerator
import java.security.Signature
import java.security.spec.ECGenParameterSpec

class PosDeviceProofProtocolTest {
    private val deviceId = "imin-test-device"

    @Test
    fun `canonical request matches stable sorted JSON and body digest`() {
        val body = JSONObject()
            .put("lines", JSONArray().put(3).put(1))
            .put("amount", 12.5)
        val request = PosDeviceProofProtocol.parseSigningRequest(
            JSONObject()
                .put("tenant_id", "tenant-a")
                .put("terminal_id", "register-01")
                .put("location_id", 7)
                .put("device_id", deviceId)
                .put("purpose", "REQUEST")
                .put("session_id", "session-1")
                .put("challenge", "challenge-1")
                .put("method", "post")
                .put("path", "/api/v1/pos/checkouts?z=2&a=1")
                .put("body", body),
            expectedDeviceId = deviceId
        )

        assertEquals("stable body", "{\"amount\":12.5,\"lines\":[3,1]}", PosDeviceProofProtocol.stableJson(body))
        val bodyDigest = PosDeviceProofProtocol.sha256Hex("{\"amount\":12.5,\"lines\":[3,1]}")
        assertEquals("/api/v1/pos/checkouts?a=1&z=2", request.path)
        assertEquals(
            "{\"body_sha256\":\"$bodyDigest\",\"challenge\":\"challenge-1\",\"device_id\":\"imin-test-device\",\"location_id\":7,\"method\":\"POST\",\"path\":\"/api/v1/pos/checkouts?a=1&z=2\",\"purpose\":\"request\",\"session_id\":\"session-1\",\"tenant_id\":\"tenant-a\",\"terminal_id\":\"REGISTER-01\",\"version\":1}",
            PosDeviceProofProtocol.canonicalRequest(request)
        )
    }

    @Test
    fun `JCA ES256 signature verifies against the exported public key`() {
        val keyPair = KeyPairGenerator.getInstance("EC").apply {
            initialize(ECGenParameterSpec("secp256r1"))
        }.generateKeyPair()
        val canonical = "device-proof-interoperability-vector"
        val signature = Signature.getInstance("SHA256withECDSA").apply {
            initSign(keyPair.private)
            update(canonical.toByteArray())
        }.sign()

        assertTrue(Signature.getInstance("SHA256withECDSA").run {
            initVerify(keyPair.public)
            update(canonical.toByteArray())
            verify(signature)
        })
    }

    @Test
    fun `tenant switch changes the signed canonical request`() {
        val first = parseRequest("tenant-a")
        val second = parseRequest("tenant-b")
        assertNotEquals(
            PosDeviceProofProtocol.canonicalRequest(first),
            PosDeviceProofProtocol.canonicalRequest(second)
        )
    }

    @Test
    fun `unknown fields are rejected instead of becoming an oracle input`() {
        val error = runCatching {
            PosDeviceProofProtocol.parseSigningRequest(
                parseJsonRequest().put("private_key", "should-never-be-accepted"),
                expectedDeviceId = deviceId
            )
        }.exceptionOrNull() as PosDeviceProofProtocol.ProtocolException

        assertEquals("MALFORMED_REQUEST", error.code)
    }

    @Test
    fun `non POS paths are rejected`() {
        val error = runCatching {
            PosDeviceProofProtocol.parseSigningRequest(
                parseJsonRequest().put("path", "/api/v1/admin/accounts"),
                expectedDeviceId = deviceId
            )
        }.exceptionOrNull() as PosDeviceProofProtocol.ProtocolException

        assertEquals("PATH_NOT_APPROVED", error.code)
    }

    @Test
    fun `device mismatch and malformed location fail closed`() {
        val mismatch = runCatching {
            PosDeviceProofProtocol.parseSigningRequest(
                parseJsonRequest().put("device_id", "another-device"),
                expectedDeviceId = deviceId
            )
        }.exceptionOrNull() as PosDeviceProofProtocol.ProtocolException
        val location = runCatching {
            PosDeviceProofProtocol.parseSigningRequest(
                parseJsonRequest().put("location_id", 0),
                expectedDeviceId = deviceId
            )
        }.exceptionOrNull() as PosDeviceProofProtocol.ProtocolException

        assertEquals("DEVICE_MISMATCH", mismatch.code)
        assertEquals("INVALID_LOCATION", location.code)
    }

    @Test
    fun `different challenges produce different signed messages`() {
        val first = parseJsonRequest().put("challenge", "challenge-1")
        val second = parseJsonRequest().put("challenge", "challenge-2")
        val firstCanonical = PosDeviceProofProtocol.canonicalRequest(
            PosDeviceProofProtocol.parseSigningRequest(first, expectedDeviceId = deviceId)
        )
        val secondCanonical = PosDeviceProofProtocol.canonicalRequest(
            PosDeviceProofProtocol.parseSigningRequest(second, expectedDeviceId = deviceId)
        )

        assertNotEquals(firstCanonical, secondCanonical)
    }

    private fun parseRequest(tenantId: String): PosDeviceProofProtocol.SigningRequest {
        return PosDeviceProofProtocol.parseSigningRequest(
            parseJsonRequest().put("tenant_id", tenantId),
            expectedDeviceId = deviceId
        )
    }

    private fun parseJsonRequest(): JSONObject {
        return JSONObject()
            .put("tenant_id", "tenant-a")
            .put("terminal_id", "REGISTER-01")
            .put("location_id", 7)
            .put("device_id", deviceId)
            .put("purpose", "request")
            .put("session_id", "session-1")
            .put("challenge", "challenge-1")
            .put("method", "POST")
            .put("path", "/api/v1/pos/checkouts")
            .put("body", JSONObject().put("amount", 12.5))
    }
}
