import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    createCustomerDisplaySessionId,
    createCustomerDisplayTransport,
    CUSTOMER_DISPLAY_MESSAGE_TYPES,
    normalizeCustomerDisplayTerminalId
} from '../services/customerDisplaySync.js';
import { projectCustomerDisplaySnapshot, CUSTOMER_DISPLAY_VIEW_STATES } from '../utils/customerDisplayProjection.js';

const CUSTOMER_DISPLAY_HEARTBEAT_MS = 4000;
const CUSTOMER_DISPLAY_TIMEOUT_MS = 12000;
const CUSTOMER_DISPLAY_COMPLETION_HOLD_MS = 4500;
const CUSTOMER_DISPLAY_DEFAULT_WIDTH = 960;
const CUSTOMER_DISPLAY_DEFAULT_HEIGHT = 720;
const CUSTOMER_DISPLAY_MIN_WIDTH = 320;
const CUSTOMER_DISPLAY_MIN_HEIGHT = 320;
const CUSTOMER_DISPLAY_SCREEN_MARGIN = 32;

const roundDisplayAmount = (value, fallback = 0) => {
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed < 0) return fallback;
    return Math.round(parsed * 10000) / 10000;
};

const firstDisplayAmount = (values, fallback = 0) => {
    for (const value of values) {
        const parsed = Number(value);
        if (Number.isFinite(parsed) && parsed >= 0) return roundDisplayAmount(parsed);
    }
    return fallback;
};

const parsePaymentBreakdown = (value) => {
    if (Array.isArray(value)) return value;
    if (typeof value !== 'string') return [];
    try {
        const parsed = JSON.parse(value);
        return Array.isArray(parsed) ? parsed : [];
    } catch {
        return [];
    }
};

const buildCompletedPaymentSummary = (transaction, snapshot) => {
    const breakdown = parsePaymentBreakdown(transaction?.payment_breakdown);
    const cashEntries = breakdown.filter((entry) => (
        String(entry?.payment_type || '').trim().toLowerCase() === 'cash'
        && Number(entry?.amount ?? entry?.applied_amount ?? entry?.cash_tendered ?? 0) > 0
    ));
    const breakdownPaymentTypes = [...new Set(breakdown
        .map((entry) => String(entry?.payment_type || '').trim().toLowerCase())
        .filter(Boolean))];
    const rawPaymentType = breakdownPaymentTypes.length > 1
        ? 'split'
        : transaction?.payment_type || breakdownPaymentTypes[0] || '';
    const paymentType = String(rawPaymentType)
        .trim()
        .toLowerCase()
        .slice(0, 32);
    const isCash = paymentType === 'cash' || cashEntries.length > 0;
    const totalDue = firstDisplayAmount([transaction?.total_amount, transaction?.total], roundDisplayAmount(snapshot?.total));
    const breakdownPaid = breakdown.reduce((sum, entry) => sum + firstDisplayAmount([
        entry?.applied_amount,
        entry?.amount
    ]), 0);
    const breakdownCashReceived = cashEntries.reduce((sum, entry) => sum + firstDisplayAmount([
        entry?.cash_tendered,
        entry?.amount,
        entry?.applied_amount
    ]), 0);
    let amountPaid;
    if (breakdownPaymentTypes.length > 1) {
        amountPaid = firstDisplayAmount([transaction?.amount_paid, transaction?.paid_amount], breakdownPaid || totalDue);
    } else if (isCash) {
        amountPaid = firstDisplayAmount([transaction?.cash_received, transaction?.cash_tendered], breakdownCashReceived || totalDue);
    } else {
        amountPaid = firstDisplayAmount([transaction?.amount_paid, transaction?.paid_amount], breakdownPaid || totalDue);
    }
    const breakdownChange = cashEntries.reduce((sum, entry) => sum + firstDisplayAmount([entry?.change_amount]), 0);
    const explicitChange = firstDisplayAmount([transaction?.change_amount], null);
    let changeAmount = 0;
    if (isCash) {
        if (explicitChange !== null) changeAmount = explicitChange;
        else if (breakdownChange > 0) changeAmount = breakdownChange;
        else changeAmount = Math.max(0, amountPaid - totalDue);
    }

    return {
        paymentType,
        isCash,
        totalDue,
        amountPaid: roundDisplayAmount(amountPaid),
        changeAmount: roundDisplayAmount(changeAmount)
    };
};

export const CUSTOMER_DISPLAY_STATUSES = Object.freeze({
    CLOSED: 'closed',
    WAITING: 'waiting',
    CONNECTED: 'connected',
    DISCONNECTED: 'disconnected',
    BLOCKED: 'blocked',
    ENDED: 'ended',
    UNAVAILABLE: 'unavailable'
});

const CUSTOMER_DISPLAY_STATUS_LABELS = Object.freeze({
    [CUSTOMER_DISPLAY_STATUSES.CLOSED]: 'Not connected',
    [CUSTOMER_DISPLAY_STATUSES.WAITING]: 'Waiting for customer display',
    [CUSTOMER_DISPLAY_STATUSES.CONNECTED]: 'Customer display connected',
    [CUSTOMER_DISPLAY_STATUSES.DISCONNECTED]: 'Customer display disconnected',
    [CUSTOMER_DISPLAY_STATUSES.BLOCKED]: 'Popup blocked — allow popups',
    [CUSTOMER_DISPLAY_STATUSES.ENDED]: 'Customer display ended',
    [CUSTOMER_DISPLAY_STATUSES.UNAVAILABLE]: 'Open an active shift to use customer display'
});

const buildCustomerDisplayUrl = ({ sessionId, terminalId }) => {
    if (typeof window === 'undefined') return '';
    const url = new URL(window.location.href);
    url.search = '';
    url.hash = `/customer-display?sessionId=${encodeURIComponent(sessionId)}&terminalId=${encodeURIComponent(terminalId)}`;
    return url.toString();
};

const isSameScreen = (candidate, current) => {
    if (!candidate || !current) return false;
    return Number(candidate.availLeft) === Number(current.availLeft)
        && Number(candidate.availTop) === Number(current.availTop)
        && Number(candidate.availWidth) === Number(current.availWidth)
        && Number(candidate.availHeight) === Number(current.availHeight);
};

const requestScreenDetails = () => {
    if (typeof window === 'undefined' || typeof window.getScreenDetails !== 'function') return Promise.resolve(null);
    try {
        return Promise.resolve(window.getScreenDetails());
    } catch {
        return Promise.resolve(null);
    }
};

const getSecondaryScreen = async (screenDetailsPromise) => {
    if (!screenDetailsPromise) return null;

    try {
        const screenDetails = await screenDetailsPromise;
        const screens = Array.from(screenDetails?.screens || []);
        const currentScreen = screenDetails?.currentScreen;
        return screens.find((screen) => !isSameScreen(screen, currentScreen) && screen.isPrimary !== true)
            || screens.find((screen) => !isSameScreen(screen, currentScreen))
            || screens.find((screen) => screen.isPrimary !== true)
            || null;
    } catch {
        // Permission denial and unsupported/blocked Window Management API are
        // intentionally non-fatal; the popup remains usable on its current screen.
        return null;
    }
};

const placeCustomerDisplayWindow = async (displayWindow, screenDetailsPromise) => {
    const secondaryScreen = await getSecondaryScreen(screenDetailsPromise);
    if (!secondaryScreen || displayWindow?.closed) return false;

    const availLeft = Number(secondaryScreen.availLeft);
    const availTop = Number(secondaryScreen.availTop);
    const availWidth = Number(secondaryScreen.availWidth);
    const availHeight = Number(secondaryScreen.availHeight);
    if (![availLeft, availTop, availWidth, availHeight].every(Number.isFinite) || availWidth <= 0 || availHeight <= 0) {
        return false;
    }

    const width = Math.min(
        CUSTOMER_DISPLAY_DEFAULT_WIDTH,
        Math.max(CUSTOMER_DISPLAY_MIN_WIDTH, availWidth - CUSTOMER_DISPLAY_SCREEN_MARGIN)
    );
    const height = Math.min(
        CUSTOMER_DISPLAY_DEFAULT_HEIGHT,
        Math.max(CUSTOMER_DISPLAY_MIN_HEIGHT, availHeight - CUSTOMER_DISPLAY_SCREEN_MARGIN)
    );
    const left = Math.round(availLeft + Math.max(0, (availWidth - width) / 2));
    const top = Math.round(availTop + Math.max(0, (availHeight - height) / 2));

    try {
        displayWindow.resizeTo?.(width, height);
        displayWindow.moveTo?.(left, top);
        return true;
    } catch {
        return false;
    }
};

export const useCustomerDisplaySync = ({
    activeShiftId = null,
    cart = [],
    cartSubtotal = 0,
    cartTotal = 0,
    cartTotalQuantity = 0,
    calculatedDiscountAmount = 0,
    checkoutConfirmModalOpen = false,
    checkoutLoading = false,
    normalizedTerminalId = '',
    restaurantServiceChargeAmount = 0,
    serviceFeeAmount = 0,
    enabled = true,
    openRequestId = 0,
    endRequestId = 0,
    onOpenRequestHandled,
    onEndRequestHandled,
    sessionLocked = false,
    setupCurrency = 'PHP'
} = {}) => {
    const [status, setStatus] = useState(CUSTOMER_DISPLAY_STATUSES.CLOSED);
    const statusRef = useRef(CUSTOMER_DISPLAY_STATUSES.CLOSED);
    const bridgeRef = useRef(null);
    const displayWindowRef = useRef(null);
    const sessionIdRef = useRef('');
    const revisionRef = useRef(0);
    const lastMessageAtRef = useRef(0);
    const latestSnapshotRef = useRef(null);
    const latestActiveSnapshotRef = useRef(null);
    const paymentStartedRef = useRef(false);
    const completionActiveRef = useRef(false);
    const completionTimerRef = useRef(null);
    const handledOpenRequestRef = useRef(0);
    const handledEndRequestRef = useRef(0);
    const displayIdentityRef = useRef('');

    const updateStatus = useCallback((nextStatus) => {
        statusRef.current = nextStatus;
        setStatus(nextStatus);
    }, []);

    const safeTerminalId = normalizeCustomerDisplayTerminalId(normalizedTerminalId);
    const snapshot = useMemo(() => projectCustomerDisplaySnapshot({
        cart,
        cartSubtotal,
        cartTotal,
        cartTotalQuantity,
        calculatedDiscountAmount,
        checkoutConfirmModalOpen,
        checkoutLoading,
        currency: setupCurrency,
        restaurantServiceChargeAmount,
        serviceFeeAmount
    }), [
        cart,
        cartSubtotal,
        cartTotal,
        cartTotalQuantity,
        calculatedDiscountAmount,
        checkoutConfirmModalOpen,
        checkoutLoading,
        restaurantServiceChargeAmount,
        serviceFeeAmount,
        setupCurrency
    ]);

    useEffect(() => {
        latestSnapshotRef.current = snapshot;
        if (snapshot.items.length > 0 && snapshot.viewState !== CUSTOMER_DISPLAY_VIEW_STATES.PAYMENT) {
            latestActiveSnapshotRef.current = snapshot;
        }
    }, [snapshot]);

    useEffect(() => {
        if (checkoutConfirmModalOpen || checkoutLoading) paymentStartedRef.current = true;
    }, [checkoutConfirmModalOpen, checkoutLoading]);

    const sendSnapshot = useCallback((nextSnapshot = null) => {
        if (!bridgeRef.current) return false;
        const payload = nextSnapshot || latestSnapshotRef.current;
        if (!payload) return false;
        revisionRef.current += 1;
        bridgeRef.current.send(
            CUSTOMER_DISPLAY_MESSAGE_TYPES.SNAPSHOT,
            payload,
            revisionRef.current
        );
        return true;
    }, []);

    const sendCurrentSnapshot = useCallback(() => {
        if (completionActiveRef.current && latestSnapshotRef.current?.viewState === CUSTOMER_DISPLAY_VIEW_STATES.WAITING) {
            return false;
        }
        return sendSnapshot();
    }, [sendSnapshot]);

    const handleTransportMessage = useCallback((message) => {
        lastMessageAtRef.current = Date.now();
        if (message.messageType === CUSTOMER_DISPLAY_MESSAGE_TYPES.READY) {
            if (statusRef.current !== CUSTOMER_DISPLAY_STATUSES.ENDED) {
                updateStatus(CUSTOMER_DISPLAY_STATUSES.CONNECTED);
            }
            sendCurrentSnapshot();
            return;
        }
        if (message.messageType === CUSTOMER_DISPLAY_MESSAGE_TYPES.HEARTBEAT) {
            if (statusRef.current === CUSTOMER_DISPLAY_STATUSES.WAITING || statusRef.current === CUSTOMER_DISPLAY_STATUSES.DISCONNECTED) {
                updateStatus(CUSTOMER_DISPLAY_STATUSES.CONNECTED);
            }
        }
    }, [sendCurrentSnapshot, updateStatus]);

    const clearCompletionTimer = useCallback(() => {
        if (!completionTimerRef.current) return;
        clearTimeout(completionTimerRef.current);
        completionTimerRef.current = null;
    }, []);

    const endCustomerDisplay = useCallback(({ closeWindow = true, nextStatus = CUSTOMER_DISPLAY_STATUSES.ENDED } = {}) => {
        clearCompletionTimer();
        completionActiveRef.current = false;
        if (bridgeRef.current) {
            revisionRef.current += 1;
            bridgeRef.current.send(CUSTOMER_DISPLAY_MESSAGE_TYPES.CLOSE, {}, revisionRef.current);
            bridgeRef.current.close();
            bridgeRef.current = null;
        }
        if (closeWindow && displayWindowRef.current && !displayWindowRef.current.closed) {
            displayWindowRef.current.close();
        }
        displayWindowRef.current = null;
        sessionIdRef.current = '';
        updateStatus(nextStatus);
    }, [clearCompletionTimer, updateStatus]);

    const openCustomerDisplay = useCallback(() => {
        if (!enabled) {
            updateStatus(CUSTOMER_DISPLAY_STATUSES.CLOSED);
            return null;
        }
        if (typeof window === 'undefined' || sessionLocked || !activeShiftId || !safeTerminalId) {
            updateStatus(CUSTOMER_DISPLAY_STATUSES.UNAVAILABLE);
            return null;
        }

        endCustomerDisplay({ closeWindow: true, nextStatus: CUSTOMER_DISPLAY_STATUSES.CLOSED });
        const sessionId = createCustomerDisplaySessionId();
        const displayUrl = buildCustomerDisplayUrl({ sessionId, terminalId: safeTerminalId });
        const bridge = createCustomerDisplayTransport({
            role: 'cashier',
            sessionId,
            terminalId: safeTerminalId,
            onMessage: handleTransportMessage
        });
        bridgeRef.current = bridge;
        // Request monitor details before window.open consumes the click's
        // transient activation. The popup itself still opens synchronously.
        const screenDetailsPromise = requestScreenDetails();
        const displayWindow = window.open(
            displayUrl,
            'dgfy-pos-customer-display',
            `popup=yes,width=${CUSTOMER_DISPLAY_DEFAULT_WIDTH},height=${CUSTOMER_DISPLAY_DEFAULT_HEIGHT},resizable=yes,scrollbars=yes`
        );

        if (!displayWindow) {
            bridge.close();
            bridgeRef.current = null;
            updateStatus(CUSTOMER_DISPLAY_STATUSES.BLOCKED);
            return null;
        }

        bridge.setTargetWindow(displayWindow);
        displayWindowRef.current = displayWindow;
        void placeCustomerDisplayWindow(displayWindow, screenDetailsPromise);
        sessionIdRef.current = sessionId;
        revisionRef.current = 0;
        lastMessageAtRef.current = Date.now();
        completionActiveRef.current = false;
        updateStatus(CUSTOMER_DISPLAY_STATUSES.WAITING);
        return displayWindow;
    }, [activeShiftId, enabled, endCustomerDisplay, handleTransportMessage, safeTerminalId, sessionLocked, updateStatus]);

    useEffect(() => {
        if (enabled) return;
        endCustomerDisplay({ closeWindow: true, nextStatus: CUSTOMER_DISPLAY_STATUSES.CLOSED });
    }, [enabled, endCustomerDisplay]);

    useEffect(() => {
        if (!openRequestId || handledOpenRequestRef.current === openRequestId) return;
        handledOpenRequestRef.current = openRequestId;
        openCustomerDisplay();
        onOpenRequestHandled?.(openRequestId);
    }, [onOpenRequestHandled, openCustomerDisplay, openRequestId]);

    useEffect(() => {
        if (!endRequestId || handledEndRequestRef.current === endRequestId) return;
        handledEndRequestRef.current = endRequestId;
        endCustomerDisplay();
        onEndRequestHandled?.(endRequestId);
    }, [endCustomerDisplay, endRequestId, onEndRequestHandled]);

    const showCompleted = useCallback((transaction = null) => {
        if (!paymentStartedRef.current) return false;
        paymentStartedRef.current = false;
        const completedSource = latestActiveSnapshotRef.current || latestSnapshotRef.current;
        if (!completedSource || completedSource.items.length === 0) return false;
        completionActiveRef.current = true;
        clearCompletionTimer();
        sendSnapshot({
            ...completedSource,
            viewState: CUSTOMER_DISPLAY_VIEW_STATES.COMPLETED,
            paymentSummary: buildCompletedPaymentSummary(transaction, completedSource),
            issuedAt: Date.now()
        });
        completionTimerRef.current = setTimeout(() => {
            completionActiveRef.current = false;
            if (!bridgeRef.current) return;
            revisionRef.current += 1;
            bridgeRef.current.send(CUSTOMER_DISPLAY_MESSAGE_TYPES.CLEAR, {}, revisionRef.current);
        }, CUSTOMER_DISPLAY_COMPLETION_HOLD_MS);
        return true;
    }, [clearCompletionTimer, sendSnapshot]);

    useEffect(() => {
        if (snapshot.items.length > 0 && completionActiveRef.current) {
            completionActiveRef.current = false;
            clearCompletionTimer();
        }
        // The status label is a health indicator, not a delivery gate. A
        // customer display can miss a heartbeat while the popup is still
        // reachable, especially on the postMessage fallback path. Always
        // replay the latest full snapshot while the bridge exists so a cart
        // mutation can recover the display without waiting for a new READY.
        if (bridgeRef.current) {
            sendCurrentSnapshot();
        }
    }, [clearCompletionTimer, sendCurrentSnapshot, snapshot]);

    useEffect(() => {
        const nextIdentity = `${String(activeShiftId || '').trim()}:${safeTerminalId}`;
        if (!displayIdentityRef.current) {
            displayIdentityRef.current = nextIdentity;
            return;
        }
        if (displayIdentityRef.current === nextIdentity) return;
        displayIdentityRef.current = nextIdentity;
        if (bridgeRef.current) {
            endCustomerDisplay({ closeWindow: true, nextStatus: CUSTOMER_DISPLAY_STATUSES.CLOSED });
        }
    }, [activeShiftId, endCustomerDisplay, safeTerminalId]);

    useEffect(() => {
        const heartbeatTimer = setInterval(() => {
            if (!bridgeRef.current) return;
            bridgeRef.current.send(CUSTOMER_DISPLAY_MESSAGE_TYPES.HEARTBEAT, {}, revisionRef.current);
        }, CUSTOMER_DISPLAY_HEARTBEAT_MS);
        const healthTimer = setInterval(() => {
            if (!bridgeRef.current) return;
            if (displayWindowRef.current?.closed) {
                // Closing the customer window is the same user intent as End display.
                endCustomerDisplay({ closeWindow: false, nextStatus: CUSTOMER_DISPLAY_STATUSES.ENDED });
                return;
            }
            if (
                statusRef.current === CUSTOMER_DISPLAY_STATUSES.CONNECTED
                && Date.now() - lastMessageAtRef.current > CUSTOMER_DISPLAY_TIMEOUT_MS
            ) {
                updateStatus(CUSTOMER_DISPLAY_STATUSES.DISCONNECTED);
            }
        }, 1000);
        return () => {
            clearInterval(heartbeatTimer);
            clearInterval(healthTimer);
        };
    }, [endCustomerDisplay, updateStatus]);

    useEffect(() => () => {
        clearCompletionTimer();
        if (bridgeRef.current) {
            revisionRef.current += 1;
            bridgeRef.current.send(CUSTOMER_DISPLAY_MESSAGE_TYPES.CLOSE, {}, revisionRef.current);
            bridgeRef.current.close();
            bridgeRef.current = null;
        }
    }, [clearCompletionTimer]);

    const customerDisplayCanOpen = enabled === true
        && !sessionLocked
        && Boolean(activeShiftId)
        && Boolean(safeTerminalId);
    return {
        customerDisplayCanOpen,
        customerDisplayStatus: status,
        customerDisplayStatusLabel: CUSTOMER_DISPLAY_STATUS_LABELS[status] || CUSTOMER_DISPLAY_STATUS_LABELS[CUSTOMER_DISPLAY_STATUSES.CLOSED],
        endCustomerDisplay,
        openCustomerDisplay,
        showCustomerDisplayCompleted: showCompleted
    };
};
