import { DomainError, DomainErrorCode } from '../modules/shared/contracts/domainErrors.js';

const DEFAULT_BASE_URL = process.env.DEVICE_BRIDGE_BASE_URL || 'http://127.0.0.1:5101';
const DEFAULT_TIMEOUT_MS = Number.parseInt(process.env.DEVICE_BRIDGE_TIMEOUT_MS || '5000', 10) || 5000;
const API_KEY = process.env.DEVICE_BRIDGE_API_KEY || '';

const buildUrl = (path) => {
    const normalizedBase = DEFAULT_BASE_URL.replace(/\/+$/, '');
    const normalizedPath = path.startsWith('/') ? path : `/${path}`;
    return `${normalizedBase}${normalizedPath}`;
};

const buildHeaders = () => {
    const headers = {
        'content-type': 'application/json'
    };

    if (API_KEY) {
        headers['x-device-bridge-key'] = API_KEY;
    }

    return headers;
};

const mapBridgeFailure = ({ statusCode, payload, fallbackMessage }) => {
    const bridgeMessage = payload?.message || fallbackMessage;

    if (statusCode === 401 || statusCode === 403) {
        return new DomainError(
            DomainErrorCode.AUTHORIZATION_FAILED,
            bridgeMessage,
            {
                statusCode,
                details: {
                    bridge_error: payload?.error || null
                }
            }
        );
    }

    if (statusCode >= 400 && statusCode < 500) {
        return new DomainError(
            DomainErrorCode.VALIDATION_FAILED,
            bridgeMessage,
            {
                statusCode,
                details: {
                    bridge_error: payload?.error || null
                }
            }
        );
    }

    return new DomainError(
        DomainErrorCode.SERVICE_UNAVAILABLE,
        bridgeMessage,
        {
            statusCode: 503,
            details: {
                bridge_error: payload?.error || null
            }
        }
    );
};

const requestBridge = async (path, { method = 'GET', body = null } = {}) => {
    const controller = new AbortController();
    const timeoutHandle = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);
    const requestUrl = buildUrl(path);

    try {
        const response = await fetch(requestUrl, {
            method,
            headers: buildHeaders(),
            body: body ? JSON.stringify(body) : undefined,
            signal: controller.signal
        });

        let payload = null;
        try {
            payload = await response.json();
        } catch {
            payload = null;
        }

        if (!response.ok) {
            throw mapBridgeFailure({
                statusCode: response.status,
                payload,
                fallbackMessage: `Device bridge request failed: ${method} ${path}`
            });
        }

        return payload;
    } catch (error) {
        if (error instanceof DomainError) {
            throw error;
        }

        if (error?.name === 'AbortError') {
            throw new DomainError(
                DomainErrorCode.SERVICE_UNAVAILABLE,
                'Device bridge request timed out',
                { statusCode: 503 }
            );
        }

        const causeCode = String(error?.cause?.code || '').trim().toUpperCase();
        if (causeCode === 'ECONNREFUSED') {
            throw new DomainError(
                DomainErrorCode.SERVICE_UNAVAILABLE,
                `Device bridge is not reachable at ${requestUrl}`,
                { statusCode: 503 }
            );
        }

        throw new DomainError(
            DomainErrorCode.SERVICE_UNAVAILABLE,
            error?.message === 'fetch failed'
                ? `Device bridge request failed before reaching ${requestUrl}`
                : (error?.message || 'Device bridge is unavailable'),
            { statusCode: 503 }
        );
    } finally {
        clearTimeout(timeoutHandle);
    }
};

export const posDeviceBridgeService = {
    async getStatus() {
        return requestBridge('/device/status');
    },

    async printReceipt(payload = {}) {
        return requestBridge('/device/print-receipt', {
            method: 'POST',
            body: payload
        });
    },

    async printShiftSummary(payload = {}) {
        return requestBridge('/device/print-shift-summary', {
            method: 'POST',
            body: payload
        });
    },

    async printZReading(payload = {}) {
        return requestBridge('/device/print-z-reading', {
            method: 'POST',
            body: payload
        });
    },

    async openDrawer(payload = {}) {
        return requestBridge('/device/open-drawer', {
            method: 'POST',
            body: payload
        });
    }
};

export default posDeviceBridgeService;
