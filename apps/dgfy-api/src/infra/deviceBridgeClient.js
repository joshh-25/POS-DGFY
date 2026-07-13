// deviceBridgeClient.js — HTTP client adapter for the device-bridge
// receipt-printing service (D-11, D-22). Implements a fail-open strategy:
// print failures are logged as warnings, never rolled back into the sale
// itself (the Availment/Payment/Receipt are already persisted by the time
// printing is attempted).
//
// Never imports or modifies anything under backend/; it is an HTTP client only.

/**
 * Builds a device-bridge HTTP client configured for printing receipts.
 *
 * @param {{baseUrl?: string, apiKey?: string, timeoutMs?: number}} options
 *   - baseUrl: resolved from options.baseUrl or process.env.DEVICE_BRIDGE_URL
 *   - apiKey: resolved from options.apiKey or process.env.DEVICE_BRIDGE_API_KEY
 *   - timeoutMs: short timeout for printing (default ~5000ms); prevents a dead
 *     printer from blocking finalization
 * @returns {{printReceipt: Function}}
 *   printReceipt({ receipt, copies }) -> {ok: true, result} | {ok: false, warning, error}
 *   Never throws; always resolves to a structured result.
 */
export function buildDeviceBridgeClient({
    baseUrl,
    apiKey,
    timeoutMs = 5000
} = {}) {
    const resolvedBaseUrl = baseUrl || process.env.DEVICE_BRIDGE_URL;
    const resolvedApiKey = apiKey || process.env.DEVICE_BRIDGE_API_KEY;

    return {
        /**
         * POSTs a receipt payload to device-bridge for synchronous printing.
         * Returns success on 2xx; translates any non-ok/timeout/network failure
         * into a warning result (never a throw) per D-22 record-then-warn.
         *
         * If baseUrl is unset, returns { ok: false, warning: 'device_bridge_unconfigured' }
         * so a missing printer config cannot block a sale.
         *
         * @param {{receipt: Object, copies?: number}} payload
         * @returns {Promise<{ok: boolean, result?: any, warning?: string, error?: string}>}
         */
        async printReceipt({ receipt, copies = 1 } = {}) {
            if (!resolvedBaseUrl) {
                return {
                    ok: false,
                    warning: 'device_bridge_unconfigured',
                    error: 'Device bridge base URL is not configured.'
                };
            }

            const url = `${resolvedBaseUrl}/device/print-receipt`;
            const abortController = new AbortController();
            const timeoutHandle = setTimeout(() => abortController.abort(), timeoutMs);

            try {
                const response = await fetch(url, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        ...(resolvedApiKey && { 'Authorization': `Bearer ${resolvedApiKey}` })
                    },
                    body: JSON.stringify({ receipt, copies }),
                    signal: abortController.signal
                });

                clearTimeout(timeoutHandle);

                if (!response.ok) {
                    let errorData;
                    try {
                        errorData = await response.json();
                    } catch {
                        errorData = { error: 'unknown_error' };
                    }
                    return {
                        ok: false,
                        warning: 'print_failed',
                        error: errorData.error || `HTTP ${response.status}`
                    };
                }

                const result = await response.json();
                return { ok: true, result };
            } catch (err) {
                clearTimeout(timeoutHandle);

                // Distinguish between timeout, abort, and network errors
                let warning = 'print_error';
                let error = err.message;

                if (err.name === 'AbortError' || err.code === 'ABORT_ERR') {
                    warning = 'print_timeout';
                    error = 'Device bridge request timed out.';
                } else if (err instanceof TypeError) {
                    // Network error (no connection, DNS failure, etc.)
                    warning = 'device_bridge_unreachable';
                    error = 'Unable to reach device bridge.';
                }

                return { ok: false, warning, error };
            }
        }
    };
}

export default buildDeviceBridgeClient;
