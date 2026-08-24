export const POS_UPDATE_SAFETY_EVENT = 'dgfy:pos-update-safety';

const initialPosUpdateSafetyState = Object.freeze({
    unsafe: false,
    reasons: []
});

let currentPosUpdateSafetyState = initialPosUpdateSafetyState;

const addReason = (reasons, reason, condition) => {
    if (condition) reasons.push(reason);
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
