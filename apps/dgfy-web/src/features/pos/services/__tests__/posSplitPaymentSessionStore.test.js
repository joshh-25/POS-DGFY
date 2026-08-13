// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import {
    buildPosSplitPaymentStorageKey,
    clearPosSplitPaymentSessionPointer,
    isTerminalPosPaymentSession,
    persistPosSplitPaymentSessionPointer,
    readPosSplitPaymentSessionPointer
} from '../posSplitPaymentSessionStore.js';

afterEach(() => {
    window.localStorage.clear();
});

describe('POS split-payment recovery store', () => {
    it('round-trips only a valid session pointer within its cashier scope', () => {
        const storageKey = buildPosSplitPaymentStorageKey('tenant:cashier:terminal:shift:location');
        persistPosSplitPaymentSessionPointer(storageKey, {
            session_id: 501,
            idempotency_key: 'split-session-501'
        });

        expect(readPosSplitPaymentSessionPointer(storageKey)).toEqual({
            sessionId: 501,
            idempotencyKey: 'split-session-501'
        });

        clearPosSplitPaymentSessionPointer(storageKey);
        expect(readPosSplitPaymentSessionPointer(storageKey)).toBeNull();
    });

    it('rejects malformed or invalid pointers without treating them as active payments', () => {
        const storageKey = buildPosSplitPaymentStorageKey('invalid');
        window.localStorage.setItem(storageKey, '{invalid-json');
        expect(readPosSplitPaymentSessionPointer(storageKey)).toBeNull();

        window.localStorage.setItem(storageKey, JSON.stringify({ session_id: 0 }));
        expect(readPosSplitPaymentSessionPointer(storageKey)).toBeNull();
    });

    it('recognizes only completed and cancelled sessions as terminal', () => {
        expect(isTerminalPosPaymentSession({ status: 'completed' })).toBe(true);
        expect(isTerminalPosPaymentSession({ status: 'cancelled' })).toBe(true);
        expect(isTerminalPosPaymentSession({ status: 'open' })).toBe(false);
        expect(isTerminalPosPaymentSession({ status: 'partially_paid' })).toBe(false);
    });
});
