package com.dgfy.iminwrapper

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class WebPosNavigationPolicyTest {

    private val allowedHosts = setOf(
        "pos.dev.dgfy.ph",
        "skupervisor.dev.dgfy.ph",
        "10.123.37.45",
        "10.0.2.2",
        "localhost",
        "127.0.0.1"
    )

    private val cleartextHosts = setOf(
        "10.123.37.45",
        "10.0.2.2",
        "localhost",
        "127.0.0.1"
    )

    @Test
    fun `https to the live pos host is permitted`() {
        assertTrue(
            WebPosNavigationPolicy.isPermitted(
                host = "pos.dev.dgfy.ph",
                scheme = "https",
                allowedHosts = allowedHosts,
                cleartextHosts = cleartextHosts
            )
        )
    }

    @Test
    fun `http to the live pos host is rejected`() {
        // Regression: shouldOverrideUrlLoading used to check host only, so a
        // stray http:// link (or a downgraded connection) to an allowed host
        // was let through unchanged.
        assertFalse(
            WebPosNavigationPolicy.isPermitted(
                host = "pos.dev.dgfy.ph",
                scheme = "http",
                allowedHosts = allowedHosts,
                cleartextHosts = cleartextHosts
            )
        )
    }

    @Test
    fun `http to the emulator loopback host is permitted`() {
        assertTrue(
            WebPosNavigationPolicy.isPermitted(
                host = "10.0.2.2",
                scheme = "http",
                allowedHosts = allowedHosts,
                cleartextHosts = cleartextHosts
            )
        )
    }

    @Test
    fun `http to the lan preview host is permitted`() {
        assertTrue(
            WebPosNavigationPolicy.isPermitted(
                host = "10.123.37.45",
                scheme = "http",
                allowedHosts = allowedHosts,
                cleartextHosts = cleartextHosts
            )
        )
    }

    @Test
    fun `unknown host is rejected regardless of scheme`() {
        assertFalse(
            WebPosNavigationPolicy.isPermitted(
                host = "evil.example.com",
                scheme = "https",
                allowedHosts = allowedHosts,
                cleartextHosts = cleartextHosts
            )
        )
        assertFalse(
            WebPosNavigationPolicy.isPermitted(
                host = "evil.example.com",
                scheme = "http",
                allowedHosts = allowedHosts,
                cleartextHosts = cleartextHosts
            )
        )
    }

    @Test
    fun `null host is rejected`() {
        assertFalse(
            WebPosNavigationPolicy.isPermitted(
                host = null,
                scheme = "https",
                allowedHosts = allowedHosts,
                cleartextHosts = cleartextHosts
            )
        )
    }
}
