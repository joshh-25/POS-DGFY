package com.dgfy.iminwrapper

import org.junit.Assert.assertEquals
import org.junit.Test

class WebPosConsoleErrorPolicyTest {

    @Test
    fun `sentry success log never blocks the pos`() {
        // Regression: this exact console.info line blanked every bridged
        // terminal behind "Web POS script error" because it contains "error".
        assertEquals(
            ConsoleAction.IGNORE,
            WebPosConsoleErrorPolicy.classify(
                isErrorLevel = false,
                message = "[Sentry] browser error tracking enabled for pos",
                posReady = false
            )
        )
    }

    @Test
    fun `benign warning containing failed never blocks the pos`() {
        assertEquals(
            ConsoleAction.IGNORE,
            WebPosConsoleErrorPolicy.classify(
                isErrorLevel = false,
                message = "[Auth] Backend logout failed; local session still cleared.",
                posReady = true
            )
        )
    }

    @Test
    fun `error before ready blocks so the retry button is reachable`() {
        assertEquals(
            ConsoleAction.BLOCK,
            WebPosConsoleErrorPolicy.classify(
                isErrorLevel = true,
                message = "Uncaught TypeError: undefined is not a function",
                posReady = false
            )
        )
    }

    @Test
    fun `error after ready only logs so a live register stays usable`() {
        assertEquals(
            ConsoleAction.LOG_ONLY,
            WebPosConsoleErrorPolicy.classify(
                isErrorLevel = true,
                message = "Uncaught TypeError: undefined is not a function",
                posReady = true
            )
        )
    }

    @Test
    fun `allowlisted errors only log even before ready`() {
        assertEquals(
            ConsoleAction.LOG_ONLY,
            WebPosConsoleErrorPolicy.classify(
                isErrorLevel = true,
                message = "API 422 Validation Error: quantity must be positive",
                posReady = false
            )
        )
        assertEquals(
            ConsoleAction.LOG_ONLY,
            WebPosConsoleErrorPolicy.classify(
                isErrorLevel = true,
                message = "Validation failed for order payload",
                posReady = false
            )
        )
    }

    @Test
    fun `blank error before ready still blocks`() {
        assertEquals(
            ConsoleAction.BLOCK,
            WebPosConsoleErrorPolicy.classify(
                isErrorLevel = true,
                message = "",
                posReady = false
            )
        )
    }
}
