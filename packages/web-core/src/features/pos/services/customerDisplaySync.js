export const CUSTOMER_DISPLAY_PROTOCOL_VERSION = 1;
export const CUSTOMER_DISPLAY_CHANNEL_PREFIX = 'dgfy-pos-customer-display:v1';

export const CUSTOMER_DISPLAY_MESSAGE_TYPES = Object.freeze({
    READY: 'display.ready',
    SNAPSHOT: 'display.snapshot',
    CLEAR: 'display.clear',
    CLOSE: 'display.close',
    HEARTBEAT: 'display.heartbeat'
});

const CUSTOMER_DISPLAY_MESSAGE_TYPE_SET = new Set(Object.values(CUSTOMER_DISPLAY_MESSAGE_TYPES));
const CUSTOMER_DISPLAY_VIEW_STATE_SET = new Set(['waiting', 'active', 'payment', 'completed']);
const SESSION_ID_PATTERN = /^[A-Za-z0-9_-]{8,128}$/;
const TERMINAL_ID_PATTERN = /^[A-Za-z0-9._: -]{1,128}$/;

const isRecord = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const isFiniteNonNegative = (value) => Number.isFinite(Number(value)) && Number(value) >= 0;

const isPaymentSummaryValid = (paymentSummary) => paymentSummary === undefined
    || paymentSummary === null
    || (
        isRecord(paymentSummary)
        && typeof paymentSummary.paymentType === 'string'
        && paymentSummary.paymentType.length <= 32
        && typeof paymentSummary.isCash === 'boolean'
        && isFiniteNonNegative(paymentSummary.totalDue)
        && isFiniteNonNegative(paymentSummary.amountPaid)
        && isFiniteNonNegative(paymentSummary.changeAmount)
    );

const isCustomerDisplaySnapshotPayloadValid = (payload) => {
    if (!CUSTOMER_DISPLAY_VIEW_STATE_SET.has(payload.viewState)) return false;
    if (typeof payload.currency !== 'string' || payload.currency.length === 0 || payload.currency.length > 12) return false;
    if (!Array.isArray(payload.items) || payload.items.length > 200) return false;
    if (!isFiniteNonNegative(payload.itemCount) || !isFiniteNonNegative(payload.subtotal)) return false;
    if (!isFiniteNonNegative(payload.discount) || !isFiniteNonNegative(payload.serviceFees) || !isFiniteNonNegative(payload.total)) return false;
    if (!isPaymentSummaryValid(payload.paymentSummary)) return false;
    return payload.items.every((item) => (
        isRecord(item)
        && typeof item.key === 'string'
        && typeof item.name === 'string'
        && item.name.length > 0
        && item.name.length <= 120
        && isFiniteNonNegative(item.quantity)
        && isFiniteNonNegative(item.unitPrice)
        && isFiniteNonNegative(item.lineTotal)
        && Array.isArray(item.options)
        && item.options.length <= 8
        && item.options.every((option) => typeof option === 'string' && option.length <= 80)
    ));
};
export const normalizeCustomerDisplaySessionId = (value) => {
    const normalized = String(value || '').trim();
    return SESSION_ID_PATTERN.test(normalized) ? normalized : '';
};

export const normalizeCustomerDisplayTerminalId = (value) => {
    const normalized = String(value || '').trim();
    return TERMINAL_ID_PATTERN.test(normalized) ? normalized : '';
};

const randomHex = (length = 8) => {
    if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
        const bytes = new Uint8Array(Math.ceil(length / 2));
        crypto.getRandomValues(bytes);
        return Array.from(bytes)
            .map((byte) => byte.toString(16).padStart(2, '0'))
            .join('')
            .slice(0, length);
    }
    return `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`.slice(0, length);
};

export const createCustomerDisplaySessionId = () => {
    const uuid = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID()
        : `${Date.now().toString(36)}-${randomHex(16)}`;
    return `cd-${String(uuid).replace(/[^A-Za-z0-9_-]/g, '').slice(0, 96)}`;
};

export const buildCustomerDisplayChannelName = (sessionId) => {
    const normalizedSessionId = normalizeCustomerDisplaySessionId(sessionId);
    return normalizedSessionId
        ? `${CUSTOMER_DISPLAY_CHANNEL_PREFIX}:${normalizedSessionId}`
        : '';
};

export const createCustomerDisplayEnvelope = ({
    messageType,
    sessionId,
    terminalId = '',
    revision = 0,
    payload = {},
    sentAt = Date.now()
} = {}) => ({
    protocolVersion: CUSTOMER_DISPLAY_PROTOCOL_VERSION,
    messageType,
    sessionId: normalizeCustomerDisplaySessionId(sessionId),
    terminalId: normalizeCustomerDisplayTerminalId(terminalId),
    revision: Number.isInteger(Number(revision)) && Number(revision) >= 0 ? Number(revision) : 0,
    sentAt: Number.isFinite(Number(sentAt)) ? Number(sentAt) : Date.now(),
    payload: isRecord(payload) ? payload : {}
});

export const isCustomerDisplayEnvelopeValid = (envelope, {
    sessionId = '',
    terminalId = ''
} = {}) => {
    if (!isRecord(envelope)) return false;
    if (Number(envelope.protocolVersion) !== CUSTOMER_DISPLAY_PROTOCOL_VERSION) return false;
    if (!CUSTOMER_DISPLAY_MESSAGE_TYPE_SET.has(envelope.messageType)) return false;

    const expectedSessionId = normalizeCustomerDisplaySessionId(sessionId);
    const messageSessionId = normalizeCustomerDisplaySessionId(envelope.sessionId);
    if (!expectedSessionId || messageSessionId !== expectedSessionId) return false;

    const expectedTerminalId = normalizeCustomerDisplayTerminalId(terminalId);
    const messageTerminalId = normalizeCustomerDisplayTerminalId(envelope.terminalId);
    if (expectedTerminalId && messageTerminalId !== expectedTerminalId) return false;

    if (!Number.isInteger(Number(envelope.revision)) || Number(envelope.revision) < 0) return false;
    if (!Number.isFinite(Number(envelope.sentAt))) return false;
    if (!isRecord(envelope.payload)) return false;
    if (envelope.messageType === CUSTOMER_DISPLAY_MESSAGE_TYPES.SNAPSHOT && !isCustomerDisplaySnapshotPayloadValid(envelope.payload)) return false;
    return true;
};

/**
 * Creates the same-origin transport used by both the cashier window and the
 * customer window. BroadcastChannel is the normal path. postMessage is only
 * used when the runtime has no BroadcastChannel implementation (the legacy
 * iMin WebView fallback); both paths still require the generated session and
 * same-origin validation above.
 */
export const createCustomerDisplayTransport = ({
    role = 'cashier',
    sessionId,
    terminalId = '',
    targetWindow = null,
    onMessage = () => {}
} = {}) => {
    const normalizedSessionId = normalizeCustomerDisplaySessionId(sessionId);
    const normalizedTerminalId = normalizeCustomerDisplayTerminalId(terminalId);
    const channelName = buildCustomerDisplayChannelName(normalizedSessionId);
    const browserWindow = typeof window !== 'undefined' ? window : null;
    const browserOrigin = browserWindow?.location?.origin || '';
    const targetOrigin = browserOrigin && browserOrigin !== 'null' ? browserOrigin : '*';
    let currentTargetWindow = targetWindow;
    let channel = null;

    if (!normalizedSessionId || !channelName) {
        return {
            available: false,
            channelName: '',
            setTargetWindow: () => {},
            send: () => null,
            close: () => {}
        };
    }

    if (typeof BroadcastChannel === 'function') {
        try {
            channel = new BroadcastChannel(channelName);
        } catch {
            channel = null;
        }
    }

    const deliver = (candidate, sourceWindow = null) => {
        if (!isCustomerDisplayEnvelopeValid(candidate, {
            sessionId: normalizedSessionId,
            terminalId: normalizedTerminalId
        })) return;
        if (sourceWindow && currentTargetWindow && sourceWindow !== currentTargetWindow) return;
        onMessage(candidate);
    };

    const handleBroadcastMessage = (event) => deliver(event?.data || null);
    const handleWindowMessage = (event) => {
        if (browserOrigin && event?.origin && event.origin !== browserOrigin) return;
        deliver(event?.data || null, event?.source || null);
    };

    if (channel) channel.addEventListener?.('message', handleBroadcastMessage);
    if (browserWindow) browserWindow.addEventListener('message', handleWindowMessage);

    return {
        available: Boolean(channel || currentTargetWindow),
        channelName,
        usesBroadcastChannel: Boolean(channel),
        role,
        setTargetWindow: (nextWindow) => {
            currentTargetWindow = nextWindow || null;
        },
        send: (messageType, payload = {}, revision = 0) => {
            const envelope = createCustomerDisplayEnvelope({
                messageType,
                sessionId: normalizedSessionId,
                terminalId: normalizedTerminalId,
                revision,
                payload
            });
            if (channel) {
                channel.postMessage(envelope);
            } else if (currentTargetWindow && !currentTargetWindow.closed && typeof currentTargetWindow.postMessage === 'function') {
                currentTargetWindow.postMessage(envelope, targetOrigin);
            }
            return envelope;
        },
        close: () => {
            if (channel) {
                channel.removeEventListener?.('message', handleBroadcastMessage);
                channel.close?.();
            }
            if (browserWindow) browserWindow.removeEventListener('message', handleWindowMessage);
            channel = null;
            currentTargetWindow = null;
        }
    };
};
