import { afterEach, describe, expect, it } from 'vitest';
import {
    CHECKOUT_OWNED_SAFETY_REASONS,
    derivePosUpdateSafety,
    getPosUpdateSafetyState,
    hasCheckoutOwnedSafetyReason,
    publishPosUpdateSafetyState
} from '../utils/posUpdateSafety.js';

describe('POS Service Worker update safety', () => {
    afterEach(() => {
        // Module-level singleton -- reset after every test so state doesn't
        // leak across cases.
        publishPosUpdateSafetyState({});
    });

    it('flags every transaction-critical reason it is given', () => {
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

    it('reports idle when given no transaction-critical state', () => {
        expect(derivePosUpdateSafety()).toEqual({ unsafe: false, reasons: [] });
    });

    it('publishes the derived state', () => {
        const eventWindow = new EventTarget();
        eventWindow.CustomEvent = CustomEvent;
        let received = null;
        eventWindow.addEventListener('dgfy:pos-update-safety', (event) => {
            received = event.detail;
        });

        const nextState = publishPosUpdateSafetyState({ checkoutLoading: true }, eventWindow);

        expect(received).toEqual(nextState);
        expect(getPosUpdateSafetyState()).toEqual(nextState);
    });

    describe('hasCheckoutOwnedSafetyReason (#1118 RF-1, still informational post-2026-08-28)', () => {
        // Per the 2026-08-28 follow-up, nothing in this module gates
        // activation any more -- an update is never auto-applied while idle,
        // full stop (Pat's call). hasCheckoutOwnedSafetyReason now only
        // informs the notice's message (main.jsx's describeNotice), telling
        // the user whether tapping "Update now" right now would end a live
        // transaction. Still worth covering directly, not just by string
        // match, since a silent regression here would mislead the message.
        it('is true for every reason derivePosUpdateSafety can produce', () => {
            const state = derivePosUpdateSafety({
                cartLineCount: 1,
                checkoutLoading: true,
                splitPaymentSession: { status: 'active' },
                replayingQueuedCheckouts: true,
                receiptPrinting: true,
                drawerOpening: true,
                activeParkedSale: { id: 1 },
                discountApplying: true
            });

            expect(state.reasons.sort()).toEqual([...CHECKOUT_OWNED_SAFETY_REASONS].sort());
            for (const reason of state.reasons) {
                expect(hasCheckoutOwnedSafetyReason([reason])).toBe(true);
            }
        });

        it('is false for an idle state (nothing in progress)', () => {
            expect(hasCheckoutOwnedSafetyReason([])).toBe(false);
        });
    });
});
