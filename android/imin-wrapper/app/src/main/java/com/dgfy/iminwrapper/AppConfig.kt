package com.dgfy.iminwrapper

import android.os.Build
import java.net.URI

object AppConfig {
    // Sourced from the active product flavor (prod/beta) in app/build.gradle.kts.
    private val LIVE_POS_ORIGIN = BuildConfig.LIVE_POS_ORIGIN
    private val LIVE_POS_HOST = BuildConfig.LIVE_POS_HOST
    private val SKUPERVISOR_HOST = BuildConfig.SKUPERVISOR_HOST
    private const val LOCAL_LAN_HOST = "10.123.37.45"
    private const val EMULATOR_HOST = "10.0.2.2"
    private const val POS_PORT = 5174
    private const val WEB_POS_PREVIEW_PORT = 5174
    private const val BACKEND_PORT = 5000

    fun hostedPosUrl(): String {
        return hostedPosUrl(override = null, cacheBust = System.currentTimeMillis())
    }

    fun hostedPosUrl(cacheBust: Long): String {
        return hostedPosUrl(override = null, cacheBust = cacheBust)
    }

    fun hostedPosUrl(override: String?): String {
        return hostedPosUrl(override, System.currentTimeMillis())
    }

    fun hostedPosUrl(override: String?, cacheBust: Long): String {
        return "${resolveOrigin(override, POS_PORT)}/?apk_build=$cacheBust"
    }

    fun hostedWebPosUrl(): String {
        return hostedWebPosUrl(override = null, cacheBust = System.currentTimeMillis())
    }

    fun hostedWebPosUrl(cacheBust: Long): String {
        return hostedWebPosUrl(override = null, cacheBust = cacheBust)
    }

    fun hostedWebPosUrl(override: String?): String {
        return hostedWebPosUrl(override, System.currentTimeMillis())
    }

    fun hostedWebPosUrl(override: String?, cacheBust: Long): String {
        return "${resolveOrigin(override, WEB_POS_PREVIEW_PORT)}/?apk_build=$cacheBust#/terminal"
    }

    // Emulator-loopback origin for the WebView's local Vite dev server --
    // exposed so WebPosActivity's origin switcher doesn't hardcode a second
    // copy of EMULATOR_HOST/WEB_POS_PREVIEW_PORT as a literal.
    fun localDevOrigin(): String {
        return "http://$EMULATOR_HOST:$WEB_POS_PREVIEW_PORT"
    }

    fun defaultApiBaseUrl(): String {
        return if (useLivePosOrigin()) {
            "$LIVE_POS_ORIGIN/api/v1"
        } else {
            "http://${activeLocalHost()}:$BACKEND_PORT/api/v1"
        }
    }

    // Origin the WebView actually loads: the caller-supplied override when
    // it's a valid absolute http(s) URL, otherwise today's emulator
    // heuristic (see useLivePosOrigin/activeLocalHost). Exists because
    // isProbablyEmulator() forces every emulator onto the local Vite dev
    // server, which made it impossible to point a tablet AVD (no physical
    // Android tablet available) at the real dev/staging origin without a
    // rebuild. See WebPosOriginStore for where the override is persisted.
    private fun resolveOrigin(override: String?, localPort: Int): String {
        return parseOverrideOrigin(override) ?: defaultOrigin(localPort)
    }

    private fun defaultOrigin(localPort: Int): String {
        return if (useLivePosOrigin()) {
            LIVE_POS_ORIGIN
        } else {
            "http://${activeLocalHost()}:$localPort"
        }
    }

    // scheme://host[:port] for display/logging -- same resolution
    // hostedWebPosUrl() uses (the WebView's own port), just exposed for the
    // UI/log call sites that only need to show or log the active origin,
    // not build a full URL.
    fun effectiveOrigin(override: String? = null): String {
        return resolveOrigin(override, WEB_POS_PREVIEW_PORT)
    }

    // Normalizes an arbitrary override string down to scheme://host[:port],
    // discarding any path/query/fragment the user typed. Returns null for
    // blank input or anything that isn't a valid absolute http(s) URL, so a
    // malformed override falls back to defaultOrigin() rather than loading
    // a broken URL.
    private fun parseOverrideOrigin(override: String?): String? {
        val trimmed = override?.trim().orEmpty()
        if (trimmed.isEmpty()) return null
        val uri = runCatching { URI(trimmed) }.getOrNull() ?: return null
        val scheme = uri.scheme?.lowercase()
        val host = uri.host
        if ((scheme != "http" && scheme != "https") || host.isNullOrBlank()) return null
        val portSuffix = if (uri.port != -1) ":${uri.port}" else ""
        return "$scheme://$host$portSuffix"
    }

    private fun overrideHost(override: String?): String? {
        return parseOverrideOrigin(override)?.let { origin ->
            runCatching { URI(origin).host }.getOrNull()
        }
    }

    fun allowedHosts(override: String? = null): Set<String> {
        val hosts = mutableSetOf(
            LIVE_POS_HOST,
            SKUPERVISOR_HOST,
            activeLocalHost(),
            LOCAL_LAN_HOST,
            EMULATOR_HOST,
            "localhost",
            "127.0.0.1"
        )
        overrideHost(override)?.let(hosts::add)
        return hosts
    }

    // Hosts where plain HTTP is tolerated -- local development only.
    // LIVE_POS_HOST/SKUPERVISOR_HOST are deliberately excluded: those must
    // always be navigated over HTTPS, see WebPosNavigationPolicy. A custom
    // override host is deliberately excluded too, even though it's added to
    // allowedHosts() above -- an http:// override to some other, non-local
    // host should still be refused by the policy, same as any other
    // non-local host. Only http:// to override hosts that are ALSO one of
    // the already-cleartext-allowed local hosts works, which is correct.
    fun cleartextAllowedHosts(): Set<String> {
        return setOf(
            activeLocalHost(),
            LOCAL_LAN_HOST,
            EMULATOR_HOST,
            "localhost",
            "127.0.0.1"
        )
    }

    private fun activeLocalHost(): String {
        return if (isProbablyEmulator()) EMULATOR_HOST else LOCAL_LAN_HOST
    }

    private fun useLivePosOrigin(): Boolean {
        return !isProbablyEmulator()
    }

    private fun isProbablyEmulator(): Boolean {
        // .orEmpty() guards against a null field rather than a real device --
        // these are non-null in practice on-device, but the plain (non-
        // Robolectric) stub jar this module's unit tests run against returns
        // null for all three, which would otherwise NPE here.
        return Build.FINGERPRINT.orEmpty().contains("generic", ignoreCase = true) ||
            Build.MODEL.orEmpty().contains("Emulator", ignoreCase = true) ||
            Build.MODEL.orEmpty().contains("sdk_gphone", ignoreCase = true) ||
            Build.HARDWARE.orEmpty().contains("ranchu", ignoreCase = true)
    }
}
