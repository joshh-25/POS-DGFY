// #1217: when a store offers exactly one fulfillment method there is nothing to choose,
// so the storefront stops asking. This module owns that single decision for every mode's
// checkout (retail, simple/MSME, F&B, the default placeholder page, and the raw <select>
// in StorefrontCheckoutSummaryContainer) so the rule cannot drift per mode.
//
// This supersedes #1117's stated presentation ("Pickup remains visible as unavailable") on
// the visibility point only -- the disabled-but-visible treatment is still what a mode with
// three or more candidates gets for the methods it cannot offer. #1117's capability
// resolution itself is unchanged.
//
// Presentational only: selection, payload, and the server's own
// assertCheckoutLocationOperationalReadiness enforcement are untouched. StorefrontApp.jsx's
// auto-snap effect already guarantees `orderMethod` is one of the available methods.

export const NO_FULFILLMENT_METHOD_NOTICE = 'This store is not accepting online orders right now. '
  + 'Please contact the store to arrange your order.';

// Statement form of each method, used in place of the "How would you like to receive your
// order?" question when only that one method is available.
const SOLE_FULFILLMENT_METHOD_NOTICES = Object.freeze({
  delivery: 'This store only offers delivery. Pickup is not available.',
  pickup: 'This store only offers pickup. Delivery is not available.',
  takeout: 'This order will be prepared for takeout.',
  dine_in: 'This order will be served for dine in.'
});

export function getSoleFulfillmentMethodNotice(option) {
  if (!option) return NO_FULFILLMENT_METHOD_NOTICE;
  return SOLE_FULFILLMENT_METHOD_NOTICES[option.value]
    || `This store fulfills your order via ${option.label || 'the only available method'}.`;
}

/**
 * Decides whether a mode should render its fulfillment chooser at all.
 *
 * - two or more available methods -> unchanged behaviour, chooser rendered, and any
 *   candidate the location does not support keeps its "(Unavailable)" treatment;
 * - exactly one available method  -> chooser and its heading are hidden, replaced by a
 *   static line stating how the order will be received;
 * - zero available methods        -> chooser hidden, defensive notice shown. Unreachable for
 *   a `transaction`-mode store (tenantLocationUseCases.js's assertFulfillmentMethodAvailable
 *   guards the transition), which is why a message is enough;
 * - no candidates at all          -> treated as "not resolved yet", chooser left on so a
 *   still-loading checkout renders exactly as it does today rather than flashing the
 *   zero-method notice.
 */
export function resolveFulfillmentSelectorPresentation(options = []) {
  const candidates = Array.isArray(options) ? options : [];
  if (candidates.length === 0) {
    return { showSelector: true, availableOptions: [], soleOption: null, notice: '' };
  }

  const availableOptions = candidates.filter((option) => option?.available !== false);
  if (availableOptions.length >= 2) {
    return { showSelector: true, availableOptions, soleOption: null, notice: '' };
  }

  const soleOption = availableOptions[0] || null;
  return {
    showSelector: false,
    availableOptions,
    soleOption,
    notice: soleOption ? getSoleFulfillmentMethodNotice(soleOption) : NO_FULFILLMENT_METHOD_NOTICE
  };
}

export function buildCheckoutSectionNumbers({ showOrderMethodSelector = true, showTimingStep = true, isDeliveryOrder = false } = {}) {
  let next = 1;
  const orderMethod = showOrderMethodSelector ? next++ : null;
  const timing = showTimingStep ? next++ : null;
  return { orderMethod, timing, address: next, notes: isDeliveryOrder ? next + 1 : next };
}
