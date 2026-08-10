package com.dgfy.iminwrapper

/**
 * What the POS shell should do about a WebView console message.
 */
enum class ConsoleAction {
    /** Not our concern -- let it flow to Logcat via the default WebChromeClient. */
    IGNORE,

    /** Worth recording, but the terminal stays usable. */
    LOG_ONLY,

    /** The POS never finished booting; surface the blocking overlay with a retry. */
    BLOCK
}

/**
 * Decides whether a console message should blank the terminal.
 *
 * This used to live inline in [WebPosActivity.onConsoleMessage] and matched on
 * the substrings "error"/"failed" at ANY log level. That meant Sentry's own
 * success line -- console.info("[Sentry] browser error tracking enabled for
 * pos") -- blanked the POS behind "Web POS script error" purely because it
 * contains the word "error". Plenty of benign warnings tripped it too
 * ("[Auth] Backend logout failed; local session still cleared.").
 *
 * Deliberately free of Android types so it is unit-testable on the host JVM.
 */
object WebPosConsoleErrorPolicy {

    fun classify(isErrorLevel: Boolean, message: String, posReady: Boolean): ConsoleAction {
        // Level is the only signal. Message text is never used to escalate --
        // a word in a log line says nothing about whether the POS is broken.
        if (!isErrorLevel) return ConsoleAction.IGNORE
        if (isNonFatal(message)) return ConsoleAction.LOG_ONLY

        // Once the page has called notifyWebPosReady() the terminal is running,
        // so a console error is a background failure at worst. Blanking a live
        // register mid-transaction over one is far worse than the error itself,
        // and Sentry already captures it. Before ready, an error genuinely means
        // boot failed and the retry button is the right remedy.
        return if (posReady) ConsoleAction.LOG_ONLY else ConsoleAction.BLOCK
    }

    private fun isNonFatal(message: String): Boolean {
        return message.contains("API 422 Validation Error", ignoreCase = true) ||
            message.contains("Validation failed", ignoreCase = true)
    }
}
