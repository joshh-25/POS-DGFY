export const POS_UPDATE_SAFETY_EVENT = 'dgfy:pos-update-safety';

const initialPosUpdateSafetyState = Object.freeze({
    unsafe: false,
    reasons: []
});

let currentPosUpdateSafetyState = initialPosUpdateSafetyState;

const addReason = (reasons, reason, condition) => {
    if (condition) reasons.push(reason);
};

// Every reason derivePosUpdateSafety can produce -- an in-progress
// transaction. Exported so a consumer (main.jsx's update notice) can tell
// whether an in-progress transaction is what's driving the current state,
// purely to inform its message -- this never gates whether the notice shows
// or whether "Update now" is available; per #990's 2026-08-28 follow-up, an
// update is never auto-applied and the notice is never withheld, so nothing
// in this module gates activation any more. It only ever informs it.
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

// Whether any of the given reasons represents an in-progress transaction.
export const hasCheckoutOwnedSafetyReason = (reasons = []) => (
    reasons.some((reason) => checkoutOwnedSafetyReasonSet.has(reason))
);

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

export const getPosUpdateSafetyState = () => currentPosUpdateSafetyState;

export const publishPosUpdateSafetyState = (
    snapshot = {},
    windowObj = typeof window === 'undefined' ? null : window
) => {
    currentPosUpdateSafetyState = derivePosUpdateSafety(snapshot);
    if (typeof windowObj?.dispatchEvent !== 'function' || typeof windowObj?.CustomEvent !== 'function') {
        return currentPosUpdateSafetyState;
    }

    windowObj.dispatchEvent(new windowObj.CustomEvent(POS_UPDATE_SAFETY_EVENT, {
        detail: currentPosUpdateSafetyState
    }));
    return currentPosUpdateSafetyState;
};
