const isEligibleSeniorPwdValue = (value) => value === true || value === 1 || value === '1';

export const isStatutoryDiscountType = (type) => (
    ['senior', 'pwd'].includes(String(type || '').trim().toLowerCase())
);

export const getSelectableDiscountLines = (cart, type, isEligible = (line) => (
    isEligibleSeniorPwdValue(line?.senior_pwd_discount_eligible)
)) => {
    const lines = Array.isArray(cart) ? cart : [];
    return isStatutoryDiscountType(type)
        ? lines.filter((line) => isEligible(line))
        : lines;
};

export const getDiscountLineRef = (line, index = 0) => String(
    line?.line_key || line?.line_id || `item-${Number(line?.item_id) || 'unknown'}-${index}`
).trim();

export const buildDiscountAllocationTotals = (eligibleItemGroups = []) => (
    (Array.isArray(eligibleItemGroups) ? eligibleItemGroups : []).flat().reduce((totals, entry) => {
        const lineRef = String(entry?.line_ref || '').trim();
        if (!lineRef) return totals;
        totals.set(lineRef, (totals.get(lineRef) || 0) + Math.max(0, Number(entry?.eligible_quantity || 0)));
        return totals;
    }, new Map())
);

export const getAvailableDiscountQuantity = ({
    allocationTotals,
    currentQuantity = 0,
    lineRef,
    wholeCartQuantity = 0
} = {}) => Math.max(
    0,
    Math.floor(Number(wholeCartQuantity || 0))
        - (Number(allocationTotals?.get(String(lineRef || '').trim()) || 0) - Number(currentQuantity || 0))
);

export const MAX_STATUTORY_BENEFICIARIES = 20;

export const isStatutoryBeneficiaryIdentityValid = (beneficiary, primary = false) => {
    const name = String(beneficiary?.name || '').trim();
    const id = String(beneficiary?.id_number || '').trim();
    return name.length >= 2 && name.length <= 120
        && id.length >= 2 && id.length <= (primary ? 100 : 120);
};

export const isStatutoryBeneficiaryComplete = (beneficiary) => (
    isStatutoryBeneficiaryIdentityValid(beneficiary)
    && (Array.isArray(beneficiary?.eligible_items) ? beneficiary.eligible_items : [])
        .some((entry) => Number(entry?.eligible_quantity || 0) > 0)
);

export const buildDiscountItemSelection = ({
    cart = [],
    type,
    draft = {},
    isEligible,
    selectAllWhenEmpty = true,
    selectedLineRefs = null
} = {}) => {
    const selectableLines = getSelectableDiscountLines(cart, type, isEligible);
    const selectableEntries = selectableLines.map((line) => ({
        line,
        lineRef: getDiscountLineRef(line, cart.indexOf(line)),
        itemId: Number(line?.item_id),
        wholeQuantity: Math.floor(Number(line?.quantity || 0))
    })).filter((entry) => (
        entry.lineRef
        && Number.isInteger(entry.itemId)
        && entry.itemId > 0
        && entry.wholeQuantity > 0
    ));
    const selectableRefs = new Set(selectableEntries.map((entry) => entry.lineRef));
    const selectableIds = new Set(selectableEntries.map((entry) => entry.itemId));
    const draftEntries = Array.isArray(draft.eligible_items) ? draft.eligible_items : [];
    const existingByLineRef = new Map(draftEntries
        .map((entry) => [String(entry?.line_ref || '').trim(), entry])
        .filter(([lineRef]) => selectableRefs.has(lineRef)));
    const legacyByItemId = new Map(draftEntries
        .filter((entry) => !String(entry?.line_ref || '').trim())
        .map((entry) => [Number(entry?.item_id), entry])
        .filter(([itemId]) => selectableIds.has(itemId)));
    const legacySelectedIds = new Set((Array.isArray(draft.eligible_item_ids) ? draft.eligible_item_ids : [])
        .map(Number)
        .filter((itemId) => selectableIds.has(itemId)));
    const explicitRefs = Array.isArray(selectedLineRefs)
        ? selectedLineRefs.map((value) => String(value || '').trim()).filter((lineRef) => selectableRefs.has(lineRef))
        : null;
    const hasExplicitSelection = explicitRefs !== null
        || existingByLineRef.size > 0
        || legacyByItemId.size > 0
        || Array.isArray(draft.eligible_item_ids);
    const selectedRefs = explicitRefs !== null
        ? explicitRefs
        : existingByLineRef.size > 0
            ? [...existingByLineRef.keys()]
            : legacyByItemId.size > 0 || legacySelectedIds.size > 0
                ? selectableEntries
                    .filter((entry) => legacyByItemId.has(entry.itemId) || legacySelectedIds.has(entry.itemId))
                    .map((entry) => entry.lineRef)
                : hasExplicitSelection && selectAllWhenEmpty === false
                    ? []
                    : selectableEntries.map((entry) => entry.lineRef);
    const selectedRefSet = new Set(selectedRefs);
    const selectedItems = selectableEntries.filter((entry) => selectedRefSet.has(entry.lineRef)).map(({ lineRef, itemId, wholeQuantity }) => {
        const existingEntry = existingByLineRef.get(lineRef) || legacyByItemId.get(itemId);
        const existingQuantity = Number(existingEntry?.eligible_quantity);
        const eligibleQuantity = Number.isFinite(existingQuantity) && existingQuantity > 0
            ? Math.min(Math.floor(existingQuantity), wholeQuantity)
            : wholeQuantity;
        return { line_ref: lineRef, item_id: itemId, eligible_quantity: eligibleQuantity };
    }).filter((entry) => entry.eligible_quantity > 0);
    return {
        eligible_item_ids: [...new Set(selectedItems.map((entry) => entry.item_id))],
        eligible_items: selectedItems
    };
};
