import { describe, expect, it } from 'vitest';
import {
    derivePosUpdateSafety,
    getPosUpdateSafetyState,
    publishPosUpdateSafetyState
} from '../utils/posUpdateSafety.js';

describe('POS Service Worker update safety', () => {
    it('blocks activation while transaction-critical state is owned by the terminal', () => {
        const state = derivePosUpdateSafety({
            cartLineCount: 1,
            splitPaymentSession: { status: 'active' },
            receiptPrinting: true,
            drawerAuthorizationSubmitting: true,
            replayingQueuedCheckouts: true
        });

        expect(state.unsafe).toBe(true);
        expect(state.reasons).toEqual(expect.arrayContaining([
            'active_cart',
            'split_payment',
            'receipt_workflow',
            'drawer_workflow',
            'offline_replay'
        ]));
    });

    it('allows activation only when the derived terminal state is idle', () => {
        expect(derivePosUpdateSafety()).toEqual({ unsafe: false, reasons: [] });
    });

    it('publishes the derived state without creating a second transaction owner', () => {
        const eventWindow = new EventTarget();
        eventWindow.CustomEvent = CustomEvent;
        let received = null;
        eventWindow.addEventListener('dgfy:pos-update-safety', (event) => {
            received = event.detail;
        });

        const nextState = publishPosUpdateSafetyState({ checkoutLoading: true }, eventWindow);

        expect(received).toEqual(nextState);
        expect(getPosUpdateSafetyState()).toEqual(nextState);
        publishPosUpdateSafetyState({});
    });
});
