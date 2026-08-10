package com.dgfy.iminwrapper

import android.content.Context

/**
 * Persists the WebView origin override (see AppConfig.effectiveOrigin/hostedWebPosUrl) across
 * app restarts, so a tablet AVD can be pointed at the real dev/staging origin without a
 * rebuild -- see WebPosActivity's long-press origin switcher.
 *
 * Reuses the existing "native_pos" SharedPreferences file (MainActivity already writes to it
 * for the native POS API client's own settings) rather than introducing a second prefs file.
 * Deliberately does no validation beyond blank-checking -- AppConfig.parseOverrideOrigin is
 * the single source of truth for what counts as a usable override, so a value that fails
 * there just falls back, same as if nothing were stored.
 */
object WebPosOriginStore {
    private const val PREFS_NAME = "native_pos"
    private const val KEY_ORIGIN_OVERRIDE = "web_pos_origin_override"

    fun read(context: Context): String? {
        val value = prefs(context).getString(KEY_ORIGIN_OVERRIDE, null)
        return value?.trim()?.takeIf { it.isNotEmpty() }
    }

    fun write(context: Context, origin: String?) {
        val trimmed = origin?.trim().orEmpty()
        if (trimmed.isEmpty()) {
            clear(context)
            return
        }
        prefs(context).edit().putString(KEY_ORIGIN_OVERRIDE, trimmed).apply()
    }

    fun clear(context: Context) {
        prefs(context).edit().remove(KEY_ORIGIN_OVERRIDE).apply()
    }

    private fun prefs(context: Context) =
        context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
}
