// Pure logic layer for VoucherManagementPanel.jsx (#614/Phase 103, extended #1334/Phase 245).
// Extracted so the payload/validation/kind-defaulting logic is unit-testable without jsdom and the
// panel component file stays reviewable. Zero React, zero DOM, zero network -- every export here is
// a pure function of its arguments.
//
// Read `apps/dgfy-api/src/modules/vouchers/domain/voucherEligibilityPolicy.js` and
// `apps/dgfy-api/src/validators/voucherValidator.js` before touching the bitmask/payload shape
// below -- they are the source of truth this file mirrors, not the other way around.
//
// THE BUG THIS FILE MUST NOT REPEAT: the legacy Promo Codes editor
// (TerminalOperationsWorkspace.jsx's storefront promo section) hydrates its ENTIRE promo object --
// including the server-owned `used_count` -- into flat editable form state, then PUTs the whole
// blob back with no optimistic lock. A redemption between load and save gets silently clobbered.
// The voucher API defends against exactly this with a mandatory `version` field (409
// VOUCHER_VERSION_CONFLICT on a stale value) and `Joi.any().forbidden()` on `redeemed_count` /
// `redeemed_value_centavos` / `redeemed_quantity` on both create and update. This file never spreads
// its whole form draft into an outgoing payload -- `buildVoucherPayload` below builds the request
// body field-by-field from exactly the writable columns, so a server-owned counter can never leak
// into a PUT/POST no matter what ends up in local state, and every update always resends the last
// known `version`.

export const PAGE_SIZE = 20;

// #667 Phase 110: capped at 40, not the server column's full 64, to match
// apps/dgfy-api/src/validators/voucherValidator.js's narrower cap -- see that file's comment for
// why (the fiscal audit-row column a voucher redemption now writes into is VARCHAR(40)).
export const VOUCHER_CODE_PATTERN = /^[A-Z0-9][A-Z0-9._-]{2,39}$/;

// Bitmask <-> checkbox-triad conversion. Bit meanings mirror
// `voucherEligibilityPolicy.js`'s VOUCHER_CHANNEL_BITS / VOUCHER_FULFILLMENT_BITS /
// VOUCHER_ORDER_TIMING_BITS / VOUCHER_WEEKDAY_BITS exactly -- duplicated here (small, frozen,
// read-only maps) because the API module tree isn't importable from the web bundle.
export const CHANNEL_BITS = Object.freeze({ storefront: 1, pos: 2 });
export const FULFILLMENT_BITS = Object.freeze({ delivery: 1, pickup: 2 });
export const TIMING_BITS = Object.freeze({ asap: 1, scheduled: 2 });
export const WEEKDAY_BITS = Object.freeze([1, 2, 4, 8, 16, 32, 64]);
export const WEEKDAY_LABELS = Object.freeze(['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']);
export const WEEKDAY_MASK_ALL = 127;

export const hasMaskBit = (mask, bit) => {
  const numericMask = Number(mask) || 0;
  return (numericMask & bit) === bit;
};

export const maskToFlags = (mask, bitsMap) => Object.fromEntries(
  Object.entries(bitsMap).map(([key, bit]) => [key, hasMaskBit(mask, bit)])
);

export const flagsToMask = (flags, bitsMap) => Object.entries(bitsMap).reduce(
  (accumulator, [key, bit]) => (flags?.[key] ? accumulator | bit : accumulator),
  0
);

export const maskToWeekdayFlags = (mask) => WEEKDAY_BITS.map((bit) => hasMaskBit(mask, bit));
export const weekdayFlagsToMask = (flags) => WEEKDAY_BITS.reduce(
  (accumulator, bit, index) => (flags?.[index] ? accumulator | bit : accumulator),
  0
);

// Money/percent <-> string helpers, same shape as AffiliatesWorkspacePanel.jsx's.
export const centavosToPesoString = (centavos) => (centavos === null || centavos === undefined ? '' : String(Number(centavos) / 100));
export const pesoStringToCentavos = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.round(parsed * 100) : NaN;
};
export const bpsToPercentString = (bps) => (bps === null || bps === undefined ? '' : String(Number(bps) / 100));
export const percentStringToBps = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.round(parsed * 100) : NaN;
};

export const peso = (centavos) => `PHP ${(Number(centavos || 0) / 100).toFixed(2)}`;

// #1334/Phase 245: `free_delivery` added alongside the three item-benefit classes so the Vouchers
// list can label a delivery campaign's benefit cell instead of rendering it blank.
export const BENEFIT_CLASS_LABEL = Object.freeze({
  percent_off: 'Percent off',
  amount_off: 'Amount off',
  fixed_price: 'Fixed price',
  free_delivery: 'Free delivery'
});

// Exported alongside buildVoucherPayload (#716) so the regression test can start from a known-good
// form shape rather than hand-duplicating every field.
export const blankForm = () => ({
  voucherId: null,
  version: null,
  status: 'draft',
  derivedStatus: 'draft',
  code: '',
  title: '',
  subtitle: '',
  badge: '',
  validityText: '',
  // #1334/Phase 245: 'promo_code' | 'delivery_campaign'. Implicit downstream consequences --
  // benefit_class/benefit_target are never raw enum pickers, they're derived from this choice --
  // see applyVoucherKindDefaults and buildVoucherPayload below.
  voucherKind: 'promo_code',
  benefitClass: 'percent_off',
  percentOffPercent: '',
  amountOffPesos: '',
  fixedUnitPricePesos: '',
  // #696/#698: fixed_price carries EITHER fixedUnitPricePesos OR pricelistId, never both --
  // fixedPriceSource picks which the form is currently expressing.
  fixedPriceSource: 'single',
  pricelistId: '',
  maxDiscountPesos: '',
  minSpendPesos: '',
  minQuantity: '',
  allowBelowCost: false,
  stackableWithStatutory: false,
  // #713: independent of channelFlags below -- controls public storefront advertising, not code
  // usability. Default false, matching the backend column default.
  isPubliclyListed: false,
  validFrom: '',
  validUntil: '',
  validTimeStart: '',
  validTimeEnd: '',
  weekdayFlags: maskToWeekdayFlags(WEEKDAY_MASK_ALL),
  channelFlags: { storefront: true, pos: false },
  fulfillmentFlags: { delivery: true, pickup: true },
  orderTimingFlags: { asap: true, scheduled: true },
  maxRedemptions: '',
  maxTotalDiscountPesos: '',
  maxBenefitQuantity: '',
  scopes: [],
  // #1334/Phase 245: delivery_campaign-only fields. Harmless no-ops for a promo_code form --
  // buildVoucherPayload never reads them outside the delivery_campaign branch.
  deliveryWaiverMode: 'whole', // 'whole' | 'partial' -- 'whole' means delivery_amount_off_centavos: null
  deliveryAmountOffPesos: '',
  autoApply: false,
  redeemedCount: 0,
  redeemedValueCentavos: 0,
  redeemedQuantity: 0
});

// Resets the kind-dependent slice of the form when the merchant flips the voucher-type selector on
// the CREATE form (voucher_kind is read-only once a voucher exists -- see the panel's isEdit guard,
// this is never called against an existing voucher). Pure and total: always returns a fully
// kind-consistent form, never a half-migrated one.
export const applyVoucherKindDefaults = (form, voucherKind) => {
  if (voucherKind === 'delivery_campaign') {
    return {
      ...form,
      voucherKind: 'delivery_campaign',
      // Implicit per plan -- never exposed as a raw enum picker. benefit_target is server-forced to
      // 'delivery' for free_delivery anyway; setting it here too is self-documenting, not load-bearing.
      benefitClass: 'free_delivery',
      // R3: fulfillment locked to delivery-only -- a pickup order has no delivery fee.
      fulfillmentFlags: { delivery: true, pickup: false },
      // assertAutoApplyHasNoScope rejects any scope on an auto-apply voucher, and a delivery
      // benefit has no per-line component regardless of auto_apply -- always empty.
      scopes: [],
      // A delivery waiver has no per-line quantity component.
      maxBenefitQuantity: '',
      // Item-COGS / statutory-stacking guards -- no meaning against a delivery fee.
      allowBelowCost: false,
      stackableWithStatutory: false,
      // R6: force false when auto-apply is already on; otherwise leave whatever the merchant had.
      isPubliclyListed: form.autoApply === true ? false : form.isPubliclyListed
    };
  }
  return {
    ...form,
    voucherKind: 'promo_code',
    benefitClass: form.benefitClass === 'free_delivery' ? 'percent_off' : form.benefitClass,
    fulfillmentFlags: { delivery: true, pickup: true },
    autoApply: false,
    deliveryWaiverMode: 'whole',
    deliveryAmountOffPesos: ''
  };
};

// #1334/Phase 245: derives a starting code suggestion from the campaign name, for auto-apply
// campaigns where no shopper ever types the code -- it still appears in
// `voucher_redemptions.code_snapshot` and `pos_transaction_discounts.promo_code`, so a merchant
// reading a report later needs to recognise it. Always kept editable in the UI; this is a starting
// point, not a hidden/generated value.
export const suggestVoucherCode = (title) => {
  const collapsed = String(title || '')
    .toUpperCase()
    .replace(/[^A-Z0-9._-]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-+|-+$/g, '');
  const truncated = collapsed.slice(0, 40).replace(/-+$/g, '');
  if (truncated.length >= 3 && /^[A-Z0-9]/.test(truncated)) return truncated;
  // Degenerate title (empty, too short, or symbols-only) -- fall back to a generic but still
  // pattern-valid suggestion rather than leaving the code field unusably short.
  return (truncated || 'DELIVERY').padEnd(3, '0').slice(0, 40);
};

export const voucherToForm = (voucher, scopes = []) => ({
  voucherId: voucher.voucher_id,
  version: Number(voucher.version),
  status: voucher.status,
  derivedStatus: voucher.derived_status,
  code: voucher.code || '',
  title: voucher.title || '',
  subtitle: voucher.subtitle || '',
  badge: voucher.badge || '',
  validityText: voucher.validity_text || '',
  voucherKind: voucher.voucher_kind || 'promo_code',
  benefitClass: voucher.benefit_class,
  percentOffPercent: voucher.benefit_class === 'percent_off' ? bpsToPercentString(voucher.percent_off_bps) : '',
  amountOffPesos: voucher.benefit_class === 'amount_off' ? centavosToPesoString(voucher.amount_off_centavos) : '',
  fixedUnitPricePesos: voucher.benefit_class === 'fixed_price' ? centavosToPesoString(voucher.fixed_unit_price_centavos) : '',
  fixedPriceSource: voucher.pricelist_id != null ? 'pricelist' : 'single',
  pricelistId: voucher.pricelist_id != null ? String(voucher.pricelist_id) : '',
  maxDiscountPesos: voucher.max_discount_centavos != null ? centavosToPesoString(voucher.max_discount_centavos) : '',
  minSpendPesos: voucher.min_spend_centavos != null ? centavosToPesoString(voucher.min_spend_centavos) : '',
  minQuantity: voucher.min_quantity != null ? String(voucher.min_quantity) : '',
  allowBelowCost: voucher.allow_below_cost === true,
  stackableWithStatutory: voucher.stackable_with_statutory === true,
  isPubliclyListed: voucher.is_publicly_listed === true,
  validFrom: voucher.valid_from || '',
  validUntil: voucher.valid_until || '',
  validTimeStart: voucher.valid_time_start || '',
  validTimeEnd: voucher.valid_time_end || '',
  weekdayFlags: maskToWeekdayFlags(voucher.weekday_mask),
  channelFlags: maskToFlags(voucher.channels_mask, CHANNEL_BITS),
  fulfillmentFlags: maskToFlags(voucher.fulfillment_methods_mask, FULFILLMENT_BITS),
  orderTimingFlags: maskToFlags(voucher.order_timings_mask, TIMING_BITS),
  maxRedemptions: voucher.max_redemptions != null ? String(voucher.max_redemptions) : '',
  maxTotalDiscountPesos: voucher.max_total_discount_centavos != null ? centavosToPesoString(voucher.max_total_discount_centavos) : '',
  maxBenefitQuantity: voucher.max_benefit_quantity != null ? String(voucher.max_benefit_quantity) : '',
  scopes: (Array.isArray(scopes) ? scopes : []).map((scope) => ({
    scope_type: scope.scope_type,
    scope_ref_id: Number(scope.scope_ref_id)
  })),
  // #1334/Phase 245: free_delivery's own benefit amount -- NULL (whole-fee waiver) is the common
  // case, unlike every sibling class where the benefit amount is mandatory.
  deliveryWaiverMode: voucher.delivery_amount_off_centavos != null ? 'partial' : 'whole',
  deliveryAmountOffPesos: voucher.delivery_amount_off_centavos != null ? centavosToPesoString(voucher.delivery_amount_off_centavos) : '',
  autoApply: voucher.auto_apply === true,
  redeemedCount: Number(voucher.redeemed_count || 0),
  redeemedValueCentavos: Number(voucher.redeemed_value_centavos || 0),
  redeemedQuantity: Number(voucher.redeemed_quantity || 0)
});

// Builds the outgoing request body field-by-field from exactly the writable columns -- never a
// spread of the local draft -- so a server-owned/forbidden field can never leak into a PUT/POST.
// Exported for #716's regression test — buildVoucherPayload is a pure function of `form`, and no
// frontend test previously existed for this panel (how the create-schema null rejection shipped
// undetected).
export const buildVoucherPayload = (form) => {
  const isDeliveryCampaign = form.voucherKind === 'delivery_campaign';
  const autoApply = isDeliveryCampaign && form.autoApply === true;

  const payload = {
    code: form.code.trim().toUpperCase(),
    voucher_kind: isDeliveryCampaign ? 'delivery_campaign' : 'promo_code',
    title: form.title.trim(),
    subtitle: form.subtitle.trim() || null,
    badge: form.badge.trim() || null,
    validity_text: form.validityText.trim() || null,
    benefit_class: isDeliveryCampaign ? 'free_delivery' : form.benefitClass,
    min_spend_centavos: form.minSpendPesos === '' ? null : pesoStringToCentavos(form.minSpendPesos),
    min_quantity: form.minQuantity === '' ? null : Math.max(1, parseInt(form.minQuantity, 10) || 1),
    allow_below_cost: isDeliveryCampaign ? false : form.allowBelowCost === true,
    stackable_with_statutory: isDeliveryCampaign ? false : form.stackableWithStatutory === true,
    // R6: force false for auto-apply campaigns in v1 -- advertising a card for a code nobody needs
    // to type is, at best, an unaudited storefront-discovery interaction. See the PR body's open
    // question. Code-entered delivery campaigns (auto_apply: false) may still opt in.
    is_publicly_listed: autoApply ? false : form.isPubliclyListed === true,
    valid_from: form.validFrom || null,
    valid_until: form.validUntil || null,
    valid_time_start: form.validTimeStart || null,
    valid_time_end: form.validTimeEnd || null,
    weekday_mask: weekdayFlagsToMask(form.weekdayFlags),
    // R2: auto_apply only ever fires from storefront checkout (storeUseCases.js's
    // resolveCheckoutContext) -- force the storefront bit on so an auto-apply campaign can never be
    // authored in a configuration that can never fire. POS is meaningless once auto-apply is on, so
    // it's forced off rather than left an ambiguous editable extra bit.
    channels_mask: isDeliveryCampaign
      ? (autoApply ? CHANNEL_BITS.storefront : flagsToMask(form.channelFlags, CHANNEL_BITS))
      : flagsToMask(form.channelFlags, CHANNEL_BITS),
    // R3: a pickup order has no delivery fee -- the pickup bit is a guaranteed no-op, so delivery
    // campaigns are locked to delivery-only regardless of local checkbox state.
    fulfillment_methods_mask: isDeliveryCampaign ? FULFILLMENT_BITS.delivery : flagsToMask(form.fulfillmentFlags, FULFILLMENT_BITS),
    order_timings_mask: flagsToMask(form.orderTimingFlags, TIMING_BITS),
    max_redemptions: form.maxRedemptions === '' ? null : Math.max(1, parseInt(form.maxRedemptions, 10) || 1),
    max_total_discount_centavos: form.maxTotalDiscountPesos === '' ? null : pesoStringToCentavos(form.maxTotalDiscountPesos),
    // A delivery waiver has no per-line quantity component -- always null for a delivery campaign.
    max_benefit_quantity: isDeliveryCampaign
      ? null
      : (form.maxBenefitQuantity === '' ? null : Math.max(1, parseInt(form.maxBenefitQuantity, 10) || 1)),
    // assertAutoApplyHasNoScope rejects any scope on an auto-apply voucher, and a delivery benefit
    // has no per-line component regardless -- always empty for a delivery campaign.
    scopes: isDeliveryCampaign
      ? []
      : form.scopes.map(({ scope_type, scope_ref_id }) => ({ scope_type, scope_ref_id: Number(scope_ref_id) }))
  };

  if (isDeliveryCampaign) {
    // benefit_target is server-forced to 'delivery' for free_delivery anyway (applyBenefitConfig) --
    // sent explicitly here too so the payload is self-documenting rather than relying on a server
    // override the client can't see.
    payload.benefit_target = 'delivery';
    payload.auto_apply = autoApply;
    payload.delivery_amount_off_centavos = form.deliveryWaiverMode === 'partial'
      ? (form.deliveryAmountOffPesos === '' ? NaN : pesoStringToCentavos(form.deliveryAmountOffPesos))
      : null;
    return payload;
  }

  if (form.benefitClass === 'percent_off') {
    payload.percent_off_bps = percentStringToBps(form.percentOffPercent);
    payload.max_discount_centavos = form.maxDiscountPesos === '' ? null : pesoStringToCentavos(form.maxDiscountPesos);
  } else if (form.benefitClass === 'amount_off') {
    payload.amount_off_centavos = pesoStringToCentavos(form.amountOffPesos);
  } else if (form.benefitClass === 'fixed_price') {
    // #696: EITHER a single pinned price OR a pricelist, never both -- the server enforces this
    // XOR authoritatively (voucherUseCases.js's applyBenefitConfig); mirrored here so a merchant
    // never even builds a payload that would be rejected.
    if (form.fixedPriceSource === 'pricelist') {
      payload.pricelist_id = form.pricelistId ? Number(form.pricelistId) : null;
      payload.fixed_unit_price_centavos = null;
      // A pricelist IS the scope (#696) -- no voucher_scopes rows needed.
      payload.scopes = [];
    } else {
      payload.fixed_unit_price_centavos = pesoStringToCentavos(form.fixedUnitPricePesos);
      payload.pricelist_id = null;
    }
  }

  return payload;
};

export const validateFormLocally = (form) => {
  const errors = [];
  const addError = (field, message) => errors.push({ field, message });
  const isDeliveryCampaign = form.voucherKind === 'delivery_campaign';

  if (form.title.trim().length < 2) addError('title', 'Title must be at least 2 characters.');
  const normalizedCode = form.code.trim().toUpperCase();
  if (!normalizedCode) addError('code', 'Code is required.');
  else if (!VOUCHER_CODE_PATTERN.test(normalizedCode)) {
    addError('code', 'Code must be 3-40 characters: A-Z, 0-9, dot, underscore or hyphen, starting with a letter or digit.');
  }

  if (isDeliveryCampaign) {
    if (form.deliveryWaiverMode === 'partial') {
      const centavos = form.deliveryAmountOffPesos === '' ? NaN : pesoStringToCentavos(form.deliveryAmountOffPesos);
      if (!Number.isFinite(centavos) || centavos <= 0) {
        addError('delivery_amount_off_centavos', "Enter an amount greater than ₱0, or choose 'waive the whole fee'.");
      }
    }
    if (form.minSpendPesos !== '') {
      const centavos = pesoStringToCentavos(form.minSpendPesos);
      if (!Number.isFinite(centavos) || centavos < 0) addError('min_spend_centavos', 'Minimum item subtotal cannot be negative.');
    }
  } else if (form.benefitClass === 'percent_off') {
    const bps = percentStringToBps(form.percentOffPercent);
    if (!Number.isFinite(bps) || bps < 1 || bps > 10000) addError('percent_off_bps', 'Enter a percentage between 0.01% and 100%.');
  } else if (form.benefitClass === 'amount_off') {
    const centavos = pesoStringToCentavos(form.amountOffPesos);
    if (!Number.isFinite(centavos) || centavos < 1) addError('amount_off_centavos', 'Enter an amount greater than 0.');
  } else if (form.benefitClass === 'fixed_price') {
    if (form.fixedPriceSource === 'pricelist') {
      if (!form.pricelistId) addError('pricelist_id', 'Select a pricelist.');
    } else {
      const centavos = pesoStringToCentavos(form.fixedUnitPricePesos);
      if (!Number.isFinite(centavos) || centavos < 0) addError('fixed_unit_price_centavos', 'Enter a fixed price of 0 or more.');
      if (form.scopes.length === 0) addError('scopes', 'Add at least one item or folder scope for a fixed-price voucher.');
    }
  }

  if (form.weekdayFlags.every((flag) => !flag)) addError('weekday_mask', 'Select at least one day of the week.');
  if (!form.channelFlags.storefront && !form.channelFlags.pos) addError('channels_mask', 'Select at least one channel.');
  if (!isDeliveryCampaign && !form.fulfillmentFlags.delivery && !form.fulfillmentFlags.pickup) {
    addError('fulfillment_methods_mask', 'Select at least one fulfillment method.');
  }
  if (!form.orderTimingFlags.asap && !form.orderTimingFlags.scheduled) addError('order_timings_mask', 'Select at least one order timing.');

  if (form.validFrom && form.validUntil && form.validUntil < form.validFrom) {
    addError('valid_until', 'End date cannot be earlier than the start date.');
  }
  const hasStart = Boolean(form.validTimeStart);
  const hasEnd = Boolean(form.validTimeEnd);
  if (hasStart !== hasEnd) addError('valid_time_end', 'Set both a start and end time, or leave both blank.');
  else if (hasStart && hasEnd && form.validTimeStart === form.validTimeEnd) {
    addError('valid_time_end', 'Start time and end time cannot be equal.');
  }

  return errors;
};
