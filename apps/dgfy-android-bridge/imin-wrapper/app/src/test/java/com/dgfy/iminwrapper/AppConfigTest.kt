package com.dgfy.iminwrapper

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Covers AppConfig's origin-override layer (see WebPosOriginStore / the WebPosActivity origin
 * switcher) -- added because an emulator always resolving to the local Vite dev server by
 * default made it impossible to point a tablet AVD (no physical Android tablet available) at
 * the real dev/staging origin without a rebuild.
 *
 * isProbablyEmulator() itself isn't independently asserted here -- this module has no
 * Robolectric, so Build.FINGERPRINT/MODEL/HARDWARE all read as null under the plain stub jar
 * these tests run against (see the .orEmpty() guards in AppConfig). That resolves
 * deterministically to the non-emulator branch, which the "no override" assertions below rely
 * on -- BuildConfig.LIVE_POS_ORIGIN is the expected fallback in this test environment.
 */
class AppConfigTest {

    @Test
    fun `null override falls back to the live origin`() {
        val url = AppConfig.hostedWebPosUrl(override = null, cacheBust = 42L)
        assertEquals("${BuildConfig.LIVE_POS_ORIGIN}/?apk_build=42#/terminal", url)
    }

    @Test
    fun `blank override falls back same as null`() {
        val url = AppConfig.hostedWebPosUrl(override = "   ", cacheBust = 42L)
        assertEquals("${BuildConfig.LIVE_POS_ORIGIN}/?apk_build=42#/terminal", url)
    }

    @Test
    fun `valid override is used verbatim as the origin`() {
        val url = AppConfig.hostedWebPosUrl(override = "https://pos.override-test.example.ph", cacheBust = 7L)
        assertEquals("https://pos.override-test.example.ph/?apk_build=7#/terminal", url)
    }

    @Test
    fun `override with a path query or fragment is normalized down to origin only`() {
        val url = AppConfig.hostedWebPosUrl(
            override = "https://pos.override-test.example.ph/some/path?x=1#/whatever",
            cacheBust = 7L
        )
        assertEquals("https://pos.override-test.example.ph/?apk_build=7#/terminal", url)
    }

    @Test
    fun `override with an explicit port is preserved`() {
        val url = AppConfig.hostedWebPosUrl(override = "http://10.123.37.99:5174", cacheBust = 1L)
        assertEquals("http://10.123.37.99:5174/?apk_build=1#/terminal", url)
    }

    @Test
    fun `malformed override falls back to the default origin`() {
        val url = AppConfig.hostedWebPosUrl(override = "not-a-url", cacheBust = 1L)
        assertEquals("${BuildConfig.LIVE_POS_ORIGIN}/?apk_build=1#/terminal", url)
    }

    @Test
    fun `non-http scheme override falls back to the default origin`() {
        val url = AppConfig.hostedWebPosUrl(override = "ftp://example.com", cacheBust = 1L)
        assertEquals("${BuildConfig.LIVE_POS_ORIGIN}/?apk_build=1#/terminal", url)
    }

    @Test
    fun `hostedPosUrl applies the same override handling`() {
        val url = AppConfig.hostedPosUrl(override = "https://pos.override-test.example.ph", cacheBust = 3L)
        assertEquals("https://pos.override-test.example.ph/?apk_build=3", url)
    }

    @Test
    fun `effectiveOrigin reflects the override, or the live origin when unset`() {
        assertEquals(
            "https://pos.override-test.example.ph",
            AppConfig.effectiveOrigin("https://pos.override-test.example.ph/x")
        )
        assertEquals(BuildConfig.LIVE_POS_ORIGIN, AppConfig.effectiveOrigin(null))
    }

    @Test
    fun `override host is added to allowedHosts but not to cleartextAllowedHosts`() {
        val overrideOrigin = "https://pos.override-test.example.ph"

        assertTrue(AppConfig.allowedHosts(overrideOrigin).contains("pos.override-test.example.ph"))
        assertFalse(AppConfig.cleartextAllowedHosts().contains("pos.override-test.example.ph"))
    }

    @Test
    fun `allowedHosts without an override does not include a stray host`() {
        assertFalse(AppConfig.allowedHosts(null).contains("evil.example.com"))
    }

    @Test
    fun `localDevOrigin points at the emulator loopback on the WebView preview port`() {
        assertEquals("http://10.0.2.2:5174", AppConfig.localDevOrigin())
    }
}
