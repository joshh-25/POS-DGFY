export const POS_UPDATE_SAFETY_EVENT = 'dgfy:pos-update-safety';

const EMPTY_SAFETY_STATE = Object.freeze({
    unsafe: false,
    reasons: []
});

// Two independent parts of the POS app publish into this one gate:
// - 'checkout' (POSCheckoutTerminal.jsx): cart/checkout/receipt/drawer state,
//   only mounted after login.
// - 'shell' (TerminalPage.jsx): whether a session exists at all and whether
//   the login/unlock forms have unsubmitted input -- covers the login screen,
//   which 'checkout' never sees.
// A single last-write-wins snapshot would let either source silently clear
// the other's "unsafe" (this is exactly how a deferred update used to get
// released the instant checkout unmounted on logout -- #990). Keyed storage
// with a merge on read fixes that.
const safetyStateBySource = {
    checkout: EMPTY_SAFETY_STATE,
    shell: EMPTY_SAFETY_STATE
};

const addReason = (reasons, reason, condition) => {
    if (condition) reasons.push(reason);
};

// Every reason derivePosUpdateSafety can produce -- i.e. an in-progress
// transaction, owned by 'checkout'. Exported as the single source of truth so
// a consumer (main.jsx's force-activation button) can tell a transaction
// reason apart from a 'shell' (session/login) reason without hand-maintaining
// a second copy of this list that could drift from the real one.
export const CHECKOUT_OWNED_SAFETY_REASONS = Object.freeze([
    'active_cart',
    'checkout_commit',
    'split_payment',
    'offline_replay',
    'receipt_workflow',
    'drawer_workflow',
    'parked_sale_workflow',
    'checkout_editing'
]);

const checkoutOwnedSafetyReasonSet = new Set(CHECKOUT_OWNED_SAFETY_REASONS);

// Whether any of the given reasons represents an in-progress transaction
// (as opposed to a session/login-only reason) -- i.e. whether it would be
// unsafe to let a user force an update past this state with a click.
export const hasCheckoutOwnedSafetyReason = (reasons = []) => (
    reasons.some((reason) => checkoutOwnedSafetyReasonSet.has(reason))
);

const mergeSafetyStates = () => {
    const reasons = [];
    const seen = new Set();
    for (const source of ['checkout', 'shell']) {
        for (const reason of safetyStateBySource[source].reasons) {
            if (seen.has(reason)) continue;
            seen.add(reason);
            reasons.push(reason);
        }
    }
    return reasons.length === 0 ? EMPTY_SAFETY_STATE : { unsafe: true, reasons };
};

const publishMergedState = (windowObj) => {
    const merged = mergeSafetyStates();
    if (typeof windowObj?.dispatchEvent === 'function' && typeof windowObj?.CustomEvent === 'function') {
        windowObj.dispatchEvent(new windowObj.CustomEvent(POS_UPDATE_SAFETY_EVENT, {
            detail: merged
        }));
    }
    return merged;
};

export const derivePosUpdateSafety = ({
    cartLineCount = 0,
    checkoutLoading = false,
    checkoutConfirmModalOpen = false,
    splitPaymentDialogOpen = false,
    splitPaymentSession = null,
    replayingQueuedCheckouts = false,
    receiptPrinting = false,
    billRequestPrinting = false,
    receiptPreviewModalOpen = false,
    drawerOpening = false,
    drawerAuthorizationModalOpen = false,
    drawerAuthorizationSubmitting = false,
    activeParkedSale = null,
    parkedSalePayContext = null,
    discountModalOpen = false,
    discountApplying = false
} = {}) => {
    const reasons = [];
    addReason(reasons, 'active_cart', Number(cartLineCount) > 0);
    addReason(reasons, 'checkout_commit', checkoutLoading === true || checkoutConfirmModalOpen === true);
    addReason(reasons, 'split_payment', splitPaymentDialogOpen === true || Boolean(splitPaymentSession));
    addReason(reasons, 'offline_replay', replayingQueuedCheckouts === true);
    addReason(
        reasons,
        'receipt_workflow',
        receiptPrinting === true || billRequestPrinting === true || receiptPreviewModalOpen === true
    );
    addReason(
        reasons,
        'drawer_workflow',
        drawerOpening === true || drawerAuthorizationModalOpen === true || drawerAuthorizationSubmitting === true
    );
    addReason(reasons, 'parked_sale_workflow', Boolean(activeParkedSale) || Boolean(parkedSalePayContext));
    addReason(reasons, 'checkout_editing', discountModalOpen === true || discountApplying === true);

    return {
        unsafe: reasons.length > 0,
        reasons
    };
};

// Whether the POS "shell" -- the login/unlock screen and its various
// re-auth forms -- has anything unsaved or in flight. Unlike
// derivePosUpdateSafety, this has to be safe to evaluate before any
// terminal/session state exists at all.
export const derivePosShellUpdateSafety = ({
    locked = true,
    loginFieldsDirty = false,
    loginSubmitting = false,
    terminalStartupLoading = false
} = {}) => {
    const reasons = [];
    // An established session normally blocks auto-apply indefinitely -- except
    // while the terminal is itself mid-restoration (terminalStartupLoading:
    // post-login, a company switch, or an admin re-unlock), which already
    // shows a full loading screen instead of live terminal UI. Applying a
    // pending update during that exact window reads as part of the normal
    // loading sequence, not a surprise interruption of something in progress.
    addReason(reasons, 'authenticated_session', locked !== true && terminalStartupLoading !== true);
    addReason(reasons, 'login_input', loginFieldsDirty === true);
    addReason(reasons, 'login_submitting', loginSubmitting === true);

    return {
        unsafe: reasons.length > 0,
        reasons
    };
};

export const getPosUpdateSafetyState = () => mergeSafetyStates();

export const publishPosUpdateSafetyState = (
    snapshot = {},
    windowObj = typeof window === 'undefined' ? null : window
) => {
    safetyStateBySource.checkout = derivePosUpdateSafety(snapshot);
    return publishMergedState(windowObj);
};

export const publishPosShellUpdateSafety = (
    snapshot = {},
    windowObj = typeof window === 'undefined' ? null : window
) => {
    safetyStateBySource.shell = derivePosShellUpdateSafety(snapshot);
    return publishMergedState(windowObj);
};
