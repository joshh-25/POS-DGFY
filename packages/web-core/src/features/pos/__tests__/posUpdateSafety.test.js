import { afterEach, describe, expect, it } from 'vitest';
import {
    derivePosShellUpdateSafety,
    derivePosUpdateSafety,
    getPosUpdateSafetyState,
    publishPosShellUpdateSafety,
    publishPosUpdateSafetyState
} from '../utils/posUpdateSafety.js';

describe('POS Service Worker update safety', () => {
    afterEach(() => {
        // Both sources are a module-level singleton -- reset both after every
        // test so state doesn't leak across cases.
        publishPosUpdateSafetyState({});
        publishPosShellUpdateSafety({});
    });

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
    });

    describe('shell (login/session) safety', () => {
        it('is safe on an untouched, locked login screen', () => {
            expect(derivePosShellUpdateSafety({ locked: true })).toEqual({ unsafe: false, reasons: [] });
            expect(derivePosShellUpdateSafety()).toEqual({ unsafe: false, reasons: [] });
        });

        it('flags an authenticated session, dirty login input, and an in-flight submit independently', () => {
            expect(derivePosShellUpdateSafety({ locked: false }).reasons).toContain('authenticated_session');
            expect(derivePosShellUpdateSafety({ locked: true, loginFieldsDirty: true }).reasons).toContain('login_input');
            expect(derivePosShellUpdateSafety({ locked: true, loginSubmitting: true }).reasons).toContain('login_submitting');
        });
    });

    describe('merged (checkout + shell) safety', () => {
        it('stays unsafe if either source is unsafe', () => {
            publishPosUpdateSafetyState({ cartLineCount: 1 });
            publishPosShellUpdateSafety({ locked: true });
            expect(getPosUpdateSafetyState().unsafe).toBe(true);

            publishPosUpdateSafetyState({});
            publishPosShellUpdateSafety({ locked: true, loginFieldsDirty: true });
            expect(getPosUpdateSafetyState().unsafe).toBe(true);
        });

        it('is only safe when both sources report safe', () => {
            publishPosUpdateSafetyState({});
            publishPosShellUpdateSafety({ locked: true });
            expect(getPosUpdateSafetyState()).toEqual({ unsafe: false, reasons: [] });
        });

        it('a checkout unmount reset does not clear an unsafe shell state (#990)', () => {
            // Regression case: logging out used to publish {} from
            // POSCheckoutTerminal's own unmount effect, which -- before the
            // sources were keyed separately -- clobbered the shell's own
            // "unsafe" (e.g. a deferred update landing right on the login
            // screen the user just reached).
            publishPosShellUpdateSafety({ locked: true, loginFieldsDirty: true });
            publishPosUpdateSafetyState({});
            expect(getPosUpdateSafetyState().unsafe).toBe(true);
            expect(getPosUpdateSafetyState().reasons).toContain('login_input');
        });
    });
});
