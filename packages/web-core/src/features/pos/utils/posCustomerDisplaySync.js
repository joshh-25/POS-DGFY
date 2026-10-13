import { safeLocalStorageGet, safeLocalStorageSet } from './posTerminalStorage.js';
import { getCartLineSubtotal, getLineKey, round4 } from './posCheckoutTerminalUtils.js';

export const POS_CUSTOMER_DISPLAY_CHANNEL_NAME = 'dgfy_pos_customer_display_v1';
export const POS_CUSTOMER_DISPLAY_EVENT_NAME = 'dgfy:pos-customer-display';
export const POS_CUSTOMER_DISPLAY_SNAPSHOT_VERSION = 1;
export const POS_CUSTOMER_DISPLAY_SNAPSHOT_TTL_MS = 5 * 60 * 1000;

const STORAGE_KEY_PREFIX = POS_CUSTOMER_DISPLAY_CHANNEL_NAME;
const MAX_LINE_COUNT = 100;
const MAX_TEXT_LENGTH = 160;

const normalizeText = (value, maxLength = MAX_TEXT_LENGTH) => String(value ?? '')
    .trim()
    .slice(0, maxLength);

const normalizePositiveInteger = (value) => {
    const normalized = Number(value);
    return Number.isSafeInteger(normalized) && normalized > 0 ? normalized : null;
};

const normalizeTerminalId = (value) => normalizeText(value, 64)
    .replace(/\s+/g, '-')
    .toUpperCase();

export const normalizePosCustomerDisplayScope = ({
    tenantId = '',
    terminalId = '',
    locationId = null
} = {}) => ({
    tenantId: normalizeText(tenantId, 128),
    terminalId: normalizeTerminalId(terminalId),
    locationId: normalizePositiveInteger(locationId)
});

export const buildPosCustomerDisplayScopeKey = (scope = {}) => {
    const normalized = normalizePosCustomerDisplayScope(scope);
    if (!normalized.tenantId || !normalized.terminalId || !normalized.locationId) return '';

    return [
        normalized.tenantId,
        normalized.terminalId,
        normalized.locationId
    ].map((part) => encodeURIComponent(String(part))).join(':');
};

export const getPosCustomerDisplayStorageKey = (scope = {}) => {
    const scopeKey = buildPosCustomerDisplayScopeKey(scope);
    return scopeKey ? `${STORAGE_KEY_PREFIX}:${scopeKey}` : '';
};

const normalizeAmount = (value) => {
    const normalized = Number(value);
    return Number.isFinite(normalized) && normalized >= 0 ? round4(normalized) : 0;
};

const normalizeQuantity = (value) => {
    const normalized = Number(value);
    return Number.isFinite(normalized) && normalized >= 0 ? round4(normalized) : 0;
};

const normalizeCustomerDisplayLine = (line = {}, index = 0) => {
    const name = normalizeText(line?.item_name || line?.name || 'Item');
    if (!name) return null;

    const optionSource = Array.isArray(line?.service_option_details)
        ? line.service_option_details.map((option) => option?.name)
        : Array.isArray(line?.options) ? line.options : [];
    const options = optionSource
        ? optionSource
            .map((option) => normalizeText(option, 80))
            .filter(Boolean)
            .slice(0, 6)
        : [];
    const lineKey = normalizeText(line?.id || getLineKey(line) || `line-${index}`, 96) || `line-${index}`;
    const storedLineTotal = line?.line_total ?? line?.lineTotal;

    return {
        id: lineKey,
        name,
        quantity: normalizeQuantity(line?.quantity),
        unitPrice: normalizeAmount(line?.sale_price ?? line?.unitPrice),
        lineTotal: storedLineTotal === undefined
            ? normalizeAmount(getCartLineSubtotal(line))
            : normalizeAmount(storedLineTotal),
        options
    };
};

const normalizeSnapshotLines = (lines) => (Array.isArray(lines) ? lines : [])
    .slice(0, MAX_LINE_COUNT)
    .map((line, index) => normalizeCustomerDisplayLine(line, index))
    .filter(Boolean);

export const buildPosCustomerDisplaySnapshot = ({
    scope = {},
    cart = [],
    subtotal = 0,
    total = 0,
    itemCount = null,
    currency = 'PHP',
    businessName = 'DGFY'
} = {}) => {
    const normalizedScope = normalizePosCustomerDisplayScope(scope);
    const scopeKey = buildPosCustomerDisplayScopeKey(normalizedScope);
    if (!scopeKey) return null;

    const lines = normalizeSnapshotLines(cart);
    const calculatedItemCount = lines.reduce((sum, line) => sum + line.quantity, 0);
    const normalizedItemCount = Number(itemCount);
    const safeItemCount = Number.isFinite(normalizedItemCount) && normalizedItemCount >= 0
        ? round4(normalizedItemCount)
        : round4(calculatedItemCount);

    return {
        version: POS_CUSTOMER_DISPLAY_SNAPSHOT_VERSION,
        scope_key: scopeKey,
        updated_at: Date.now(),
        state: lines.length > 0 ? 'active' : 'idle',
        business_name: normalizeText(businessName, 120) || 'DGFY',
        currency: normalizeText(currency, 8).toUpperCase() || 'PHP',
        lines,
        item_count: safeItemCount,
        subtotal: normalizeAmount(subtotal),
        total: normalizeAmount(total)
    };
};

const parseSnapshot = (raw, expectedScopeKey) => {
    if (!raw) return null;

    try {
        const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
        if (Number(parsed.version) !== POS_CUSTOMER_DISPLAY_SNAPSHOT_VERSION) return null;
        if (String(parsed.scope_key || '') !== expectedScopeKey) return null;
        const lines = normalizeSnapshotLines(parsed.lines);

        return {
            ...parsed,
            lines,
            item_count: normalizeQuantity(parsed.item_count),
            subtotal: normalizeAmount(parsed.subtotal),
            total: normalizeAmount(parsed.total),
            business_name: normalizeText(parsed.business_name, 120) || 'DGFY',
            currency: normalizeText(parsed.currency, 8).toUpperCase() || 'PHP',
            state: parsed.state === 'active' && lines.length > 0
                ? 'active'
                : 'idle'
        };
    } catch {
        return null;
    }
};

export const isPosCustomerDisplaySnapshotFresh = (
    snapshot,
    now = Date.now(),
    ttlMs = POS_CUSTOMER_DISPLAY_SNAPSHOT_TTL_MS
) => {
    const updatedAt = Number(snapshot?.updated_at);
    return Boolean(
        snapshot
        && Number.isFinite(updatedAt)
        && updatedAt > 0
        && Number.isFinite(now)
        && now - updatedAt <= ttlMs
    );
};

export const readPosCustomerDisplaySnapshot = (scope = {}) => {
    const storageKey = getPosCustomerDisplayStorageKey(scope);
    const scopeKey = buildPosCustomerDisplayScopeKey(scope);
    if (!storageKey || !scopeKey) return null;
    return parseSnapshot(safeLocalStorageGet(storageKey), scopeKey);
};

export const publishPosCustomerDisplaySnapshot = (input = {}) => {
    const snapshot = buildPosCustomerDisplaySnapshot(input);
    const storageKey = getPosCustomerDisplayStorageKey(input.scope);
    if (!snapshot || !storageKey || typeof window === 'undefined') return null;

    safeLocalStorageSet(storageKey, JSON.stringify(snapshot));

    try {
        if (typeof window.BroadcastChannel === 'function') {
            const channel = new window.BroadcastChannel(POS_CUSTOMER_DISPLAY_CHANNEL_NAME);
            channel.postMessage(snapshot);
            channel.close();
        }
    } catch {
        // Local storage and the same-tab event below are the fallback channels.
    }

    try {
        window.dispatchEvent(new CustomEvent(POS_CUSTOMER_DISPLAY_EVENT_NAME, {
            detail: snapshot
        }));
    } catch {
        // CustomEvent can be unavailable in non-browser test environments.
    }

    return snapshot;
};

export const subscribeToPosCustomerDisplay = (scope = {}, onSnapshot = () => {}) => {
    const scopeKey = buildPosCustomerDisplayScopeKey(scope);
    if (!scopeKey || typeof window === 'undefined') return () => {};

    const storageKey = getPosCustomerDisplayStorageKey(scope);
    const notify = (candidate) => {
        const snapshot = parseSnapshot(candidate, scopeKey);
        if (snapshot) onSnapshot(snapshot);
    };
    const handleStorage = (event) => {
        if (event.key === storageKey) notify(event.newValue);
    };
    const handleCustomEvent = (event) => notify(event?.detail);

    window.addEventListener('storage', handleStorage);
    window.addEventListener(POS_CUSTOMER_DISPLAY_EVENT_NAME, handleCustomEvent);

    let channel = null;
    try {
        if (typeof window.BroadcastChannel === 'function') {
            channel = new window.BroadcastChannel(POS_CUSTOMER_DISPLAY_CHANNEL_NAME);
            channel.addEventListener('message', (event) => notify(event?.data));
        }
    } catch {
        channel = null;
    }

    return () => {
        window.removeEventListener('storage', handleStorage);
        window.removeEventListener(POS_CUSTOMER_DISPLAY_EVENT_NAME, handleCustomEvent);
        try {
            channel?.close();
        } catch {
            // A closed channel is already cleaned up.
        }
    };
};
