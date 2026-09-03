// #712: voucher redemption-time reason codes (voucherEligibilityPolicy.js / voucherErrors.js).
// VoucherManagementPanel.jsx's REASON_CODE_MESSAGES map is authoring-only (CRUD/lifecycle codes) --
// this is the redemption-time set a cashier can actually hit at checkout, which had no frontend
// copy anywhere before this. Both use the same `errors.reason_code` object shape.
const VOUCHER_REASON_MESSAGES = Object.freeze({
  VOUCHER_NOT_FOUND: 'Voucher code was not found.',
  VOUCHER_NOT_ACTIVE: 'This voucher is not active.',
  VOUCHER_NOT_STARTED: "This voucher's validity period hasn't started yet.",
  VOUCHER_EXPIRED: 'This voucher has expired.',
  VOUCHER_WEEKDAY_NOT_ELIGIBLE: "This voucher isn't valid today.",
  VOUCHER_TIME_WINDOW_BLOCKED: "This voucher isn't valid at this time.",
  VOUCHER_TIME_WINDOW_DEGENERATE: 'This voucher has an invalid time window. Contact an admin.',
  VOUCHER_TIMEZONE_UNRESOLVABLE: 'Could not verify this voucher\'s validity window. Try again.',
  VOUCHER_CHANNEL_NOT_ELIGIBLE: "This voucher isn't enabled for in-store (POS) redemption.",
  VOUCHER_FULFILLMENT_NOT_ELIGIBLE: "This voucher isn't valid for this order type.",
  VOUCHER_ORDER_TIMING_NOT_ELIGIBLE: "This voucher isn't valid for this order timing.",
  VOUCHER_MIN_SPEND_NOT_MET: "This order doesn't meet the voucher's minimum spend.",
  VOUCHER_MIN_QUANTITY_NOT_MET: "This order doesn't meet the voucher's minimum quantity.",
  VOUCHER_REDEMPTION_LIMIT_REACHED: 'This voucher has reached its redemption limit.',
  VOUCHER_BUDGET_EXHAUSTED: "This voucher's discount budget has been used up.",
  VOUCHER_QUANTITY_LIMIT_REACHED: 'This voucher has reached its quantity limit.',
  VOUCHER_FIXED_PRICE_AFFILIATE_CONFLICT: 'This voucher cannot combine with an active affiliate price.',
  VOUCHER_SCOPE_NO_ELIGIBLE_ITEMS: "None of the items in this order are covered by this voucher.",
  VOUCHER_PRICE_BELOW_COST: 'This voucher would price an item below cost. Contact an admin.',
  VOUCHER_DISCOUNT_SLOT_OCCUPIED: 'Only one discount can be applied to a sale. Remove the other discount first.',
  VOUCHER_POS_REDEMPTION_DISABLED: 'Voucher redemption is not enabled for this store. Contact an admin.',
  // #788 (Phase 269): account-restricted issuance. Worded for a CASHIER, not a shopper -- a
  // terminal captures a customer name, never an authenticated DGFY account (ADR 0066's 2026-08-20
  // amendment narrowed #454 decision 6 only that far), so a restricted voucher can never be
  // redeemed at POS at all. Telling the cashier to "sign in" would be nonsense; the actionable
  // answer is that this code is online-only.
  VOUCHER_ACCOUNT_REQUIRED: 'This voucher is tied to specific customer accounts and can only be used online, not at the terminal.',
  VOUCHER_ACCOUNT_NOT_ELIGIBLE: 'This voucher was issued to specific customer accounts and cannot be used here.',
  VOUCHER_ACCOUNT_GRANTS_UNRESOLVED: 'Could not verify who this voucher is issued to. Try again, or contact an admin.',
  VOUCHER_CODE_REQUIRED: 'Voucher code is required.'
});

export const buildVoucherReasonMessage = (error) => {
  const details = error?.response?.data?.errors || error?.response?.data?.details || {};
  const reasonCode = String(details?.reason_code || '').trim().toUpperCase();
  return VOUCHER_REASON_MESSAGES[reasonCode] || null;
};

export const buildFnbRecipeBlockerMessage = (error) => {
  const details = error?.response?.data?.errors || error?.response?.data?.details || {};
  const reasonCode = String(details?.reason_code || '').trim().toUpperCase();
  if (reasonCode === 'FNB_RECIPE_INGREDIENT_SHORTFALL') {
    const product = details.product_name || 'Selected menu item';
    const ingredient = details.ingredient_name || `ingredient ${details.ingredient_item_id || ''}`.trim();
    const unit = details.unit_of_measure ? ` ${details.unit_of_measure}` : '';
    const location = details.location_id ? ` at location ${details.location_id}` : '';
    return `${product}: ${ingredient} short${location}. Avail ${details.available ?? 0}${unit}; req ${details.requested ?? ''}${unit}.`;
  }
  if (reasonCode === 'FNB_RECIPE_UOM_INCOMPATIBLE') {
    const product = details.product_name || 'Selected menu item';
    const ingredient = details.ingredient_name || `ingredient ${details.ingredient_item_id || ''}`.trim();
    return `${product}: ${ingredient} unit mismatch (${details.recipe_uom || 'recipe'} to ${details.ingredient_uom || 'stock'}). Update UOM.`;
  }
  if (reasonCode === 'FNB_KITCHEN_ORDER_UNAVAILABLE') {
    return 'Kitchen order unavailable. Refresh F&B setup.';
  }
  return null;
};

export const buildValidationDetailMessage = (error) => {
  const fnbRecipeBlocker = buildFnbRecipeBlockerMessage(error);
  if (fnbRecipeBlocker) return fnbRecipeBlocker;
  const voucherReasonMessage = buildVoucherReasonMessage(error);
  if (voucherReasonMessage) return voucherReasonMessage;
  if (error?.response?.status !== 422) return null;

  const validationErrors = error?.response?.data?.errors;
  if (Array.isArray(validationErrors) && validationErrors.length > 0) {
    const summarized = validationErrors
      .map((entry) => {
        const field = String(entry?.field || '').trim();
        const message = String(entry?.message || '').trim();
        if (!message) return null;
        return field ? `${field}: ${message}` : message;
      })
      .filter(Boolean);

    if (summarized.length > 0) return summarized.slice(0, 2).join(' | ');
  }

  const fallback = String(error?.response?.data?.message || '').trim();
  return fallback || null;
};
