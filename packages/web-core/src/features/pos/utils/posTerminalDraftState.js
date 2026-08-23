const toArray = (value) => (Array.isArray(value) ? value : []);

export const parseTerminalPermissions = (permissions) => {
    if (Array.isArray(permissions)) return permissions;
    if (typeof permissions !== 'string') return [];
    try {
        const parsed = JSON.parse(permissions);
        return Array.isArray(parsed) ? parsed : [];
    } catch {
        return [];
    }
};

export const normalizeAppliedDiscount = (appliedDiscount) => (
    appliedDiscount && typeof appliedDiscount === 'object'
        ? { ...appliedDiscount, eligible_item_ids: toArray(appliedDiscount.eligible_item_ids), eligible_items: toArray(appliedDiscount.eligible_items) }
        : null
);

export const normalizePosTerminalDraftState = ({
    catalog,
    cart,
    discountProfiles,
    commercialPromoConfig,
    discountApprovers,
    activeShiftCashierId,
    queuedCheckouts,
    discountDraft
} = {}) => {
    const safeCatalog = toArray(catalog);
    const safeCart = toArray(cart);
    const safeDiscountProfiles = toArray(discountProfiles);
    const safeCommercialPromoConfig = toArray(commercialPromoConfig);
    const safeDiscountApprovers = toArray(discountApprovers);
    const activeShiftCashierApprover = safeDiscountApprovers.find((approver) => (
        Number(approver?.user_id) === Number(activeShiftCashierId)
    )) || null;
    const safeQueuedCheckouts = toArray(queuedCheckouts);
    const safeEligibleDiscountItemIds = toArray(discountDraft?.eligible_item_ids);
    const safeEligibleDiscountItems = toArray(discountDraft?.eligible_items);
    const employeeDiscountRateOptions = Array.from(new Set([
        ...safeDiscountProfiles
            .filter((profile) => profile?.active !== false)
            .map((profile) => Number(profile?.percentage))
            .filter((percentage) => Number.isFinite(percentage) && percentage > 0 && percentage <= 100),
        Number(discountDraft?.rate || 15),
        15
    ])).sort((left, right) => left - right);
    return {
        safeCatalog,
        safeCart,
        safeDiscountProfiles,
        safeCommercialPromoConfig,
        safeDiscountApprovers,
        activeShiftCashierApprover,
        safeQueuedCheckouts,
        safeEligibleDiscountItemIds,
        safeEligibleDiscountItems,
        employeeDiscountRateOptions
    };
};
