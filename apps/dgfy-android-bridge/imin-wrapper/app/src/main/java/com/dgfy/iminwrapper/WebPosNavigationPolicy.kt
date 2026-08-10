package com.dgfy.iminwrapper

/**
 * Decides whether the WebView is allowed to follow a navigation.
 *
 * Host allow-listing alone (the original `isAllowedHost` check) says nothing about
 * scheme -- a request to an allowed host over plain `http://` used to be let through
 * unchanged. That's how a compromised/misconfigured link, or a proxy silently
 * downgrading a connection, could put the terminal on cleartext HTTP without the app
 * ever noticing. LIVE_POS_HOST/SKUPERVISOR_HOST must always be HTTPS; only the local
 * development hosts (emulator, LAN preview, localhost) are allowed cleartext, and only
 * because there's no TLS available for a local Vite dev server in the first place.
 *
 * Deliberately free of Android types so it is unit-testable on the host JVM.
 */
object WebPosNavigationPolicy {

    fun isPermitted(
        host: String?,
        scheme: String?,
        allowedHosts: Set<String>,
        cleartextHosts: Set<String>
    ): Boolean {
        if (host == null || !allowedHosts.contains(host)) return false
        if (scheme.equals("https", ignoreCase = true)) return true
        return cleartextHosts.contains(host)
    }
}
