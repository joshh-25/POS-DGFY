import { getAccessToken, getCompanyToken } from '@/services/browserSession.js';
import { resolveApiBaseUrl } from '@/src/utils/runtimeConfig.js';

const POS_CATALOG_UPDATED_EVENT = 'pos:catalog-updated';
const RECONNECT_DELAY_MIN_MS = 1000;
const RECONNECT_DELAY_MAX_MS = 15000;

export const notifyPosCatalogUpdated = () => {
    if (typeof window === 'undefined') return;
    window.dispatchEvent(new Event(POS_CATALOG_UPDATED_EVENT));
};

export const subscribeToPosCatalogUpdates = (listener) => {
    if (typeof window === 'undefined' || typeof listener !== 'function') return () => {};
    window.addEventListener(POS_CATALOG_UPDATED_EVENT, listener);
    return () => window.removeEventListener(POS_CATALOG_UPDATED_EVENT, listener);
};

export const parsePosCatalogEvent = (record = '') => {
    const lines = String(record).split(/\r?\n/);
    const event = lines.find((line) => line.startsWith('event:'))?.slice(6).trim() || 'message';
    const dataText = lines
        .filter((line) => line.startsWith('data:'))
        .map((line) => line.slice(5).trim())
        .join('\n');

    if (!dataText) return { event, data: null };
    try {
        return { event, data: JSON.parse(dataText) };
    } catch {
        return { event, data: null };
    }
};

const getCatalogEventsUrl = () => `${resolveApiBaseUrl(
    import.meta.env,
    typeof window !== 'undefined' ? window.location : undefined
)}/pos/catalog/events`;

const getCatalogEventsHeaders = () => {
    const accessToken = getAccessToken();
    const companyToken = getCompanyToken();
    return {
        Accept: 'text/event-stream',
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        ...(companyToken ? { 'x-company-token': companyToken } : {})
    };
};

// EventSource cannot send the bearer/company headers required by the POS API,
// so the stream uses fetch and parses standard SSE frames. Stream messages are
// invalidations only; the normal catalog request remains the data authority.
export const subscribeToRemotePosCatalogUpdates = ({ onConnected } = {}) => {
    if (typeof window === 'undefined' || typeof fetch !== 'function' || typeof AbortController === 'undefined') {
        return () => {};
    }

    let stopped = false;
    let controller = null;
    let reconnectTimer = null;
    let reconnectDelay = RECONNECT_DELAY_MIN_MS;

    const scheduleReconnect = () => {
        if (stopped) return;
        reconnectTimer = window.setTimeout(() => {
            reconnectTimer = null;
            connect();
        }, reconnectDelay);
        reconnectDelay = Math.min(reconnectDelay * 2, RECONNECT_DELAY_MAX_MS);
    };

    const dispatchInvalidation = (event) => {
        if (event === 'connected') {
            reconnectDelay = RECONNECT_DELAY_MIN_MS;
            onConnected?.();
            notifyPosCatalogUpdated();
            return;
        }
        if (event === 'pos.catalog.changed') {
            reconnectDelay = RECONNECT_DELAY_MIN_MS;
            notifyPosCatalogUpdated();
        }
    };

    const connect = async () => {
        controller = new AbortController();
        try {
            const response = await fetch(getCatalogEventsUrl(), {
                method: 'GET',
                credentials: 'include',
                cache: 'no-store',
                headers: getCatalogEventsHeaders(),
                signal: controller.signal
            });
            if (!response.ok || !response.body) {
                throw new Error(`POS catalog event stream failed (${response.status || 'network'})`);
            }

            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let buffer = '';
            while (!stopped) {
                const { done, value } = await reader.read();
                if (done) break;
                buffer += decoder.decode(value, { stream: true });
                const records = buffer.split(/\r?\n\r?\n/);
                buffer = records.pop() || '';
                records.forEach((record) => {
                    const { event } = parsePosCatalogEvent(record);
                    dispatchInvalidation(event);
                });
            }
        } catch (error) {
            if (error?.name !== 'AbortError' && !stopped) {
                // The catalog still refreshes on focus/online below, while this
                // bounded retry recovers from temporary network/server outages.
            }
        } finally {
            if (!stopped) scheduleReconnect();
        }
    };

    connect();
    return () => {
        stopped = true;
        if (reconnectTimer) window.clearTimeout(reconnectTimer);
        controller?.abort();
    };
};
