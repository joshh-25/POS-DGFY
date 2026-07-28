import { trackEvent } from './analyticsClient.js';

/**
 * Fixed set of named funnel events. Autocapture (see analyticsClient.js)
 * already records every click for heatmaps and exploratory "what gets
 * clicked" analysis, but it identifies elements by DOM selector/text, which
 * silently breaks any dashboard or alert built on it after a UI change.
 * These named events are the ~30 state-change chokepoints (not buttons) the
 * business actually builds funnels and alerts on -- see
 * do-not-commit/observability-handoff.md / the approved plan for the full
 * rationale.
 *
 * Do not add per-button event names here. If a new chokepoint is needed,
 * add it as a named constant so trackFunnelEvent() can warn on drift.
 */
export const ANALYTICS_EVENTS = Object.freeze({
  // Storefront: discovery
  DISCOVERY_VIEWED: 'discovery_viewed',
  DISCOVERY_SEARCH_SUBMITTED: 'discovery_search_submitted',
  DISCOVERY_CATEGORY_SELECTED: 'discovery_category_selected',
  DISCOVERY_STORE_CARD_CLICKED: 'discovery_store_card_clicked',
  DISCOVERY_MAP_PIN_CLICKED: 'discovery_map_pin_clicked',

  // Storefront: catalog / item
  STORE_VIEWED: 'store_viewed',
  STORE_CATALOG_FILTERED: 'store_catalog_filtered',
  ITEM_VIEWED: 'item_viewed',

  // Storefront: cart
  CART_ITEM_ADDED: 'cart_item_added',
  CART_ITEM_REMOVED: 'cart_item_removed',

  // Storefront: checkout
  CHECKOUT_STARTED: 'checkout_started',
  CHECKOUT_STEP_COMPLETED: 'checkout_step_completed',
  PROMO_CODE_APPLIED: 'promo_code_applied',
  CHECKOUT_SUBMITTED: 'checkout_submitted',
  ORDER_PLACED: 'order_placed',
  CHECKOUT_FAILED: 'checkout_failed',

  // Storefront: tracking
  ORDER_TRACKING_VIEWED: 'order_tracking_viewed',

  // Storefront: account
  ACCOUNT_SIGNED_IN: 'account_signed_in',
  ACCOUNT_REGISTERED: 'account_registered',

  // POS
  POS_SHIFT_OPENED: 'pos_shift_opened',
  POS_SHIFT_CLOSED: 'pos_shift_closed',
  POS_ORDER_COMPLETED: 'pos_order_completed',
  POS_PAYMENT_METHOD_SELECTED: 'pos_payment_method_selected',
  POS_ORDER_VOIDED: 'pos_order_voided',
  POS_PRINT_FAILED: 'pos_print_failed',
  POS_OFFLINE_QUEUE_FLUSHED: 'pos_offline_queue_flushed'
});

const REGISTERED_EVENT_NAMES = new Set(Object.values(ANALYTICS_EVENTS));

/**
 * Thin wrapper around trackEvent() that dev-warns when firing a name that
 * isn't in ANALYTICS_EVENTS, so the funnel event set stays a deliberate,
 * reviewed list rather than drifting into hundreds of ad-hoc names.
 */
export const trackFunnelEvent = (name, properties = {}) => {
  if (import.meta.env?.DEV && !REGISTERED_EVENT_NAMES.has(name)) {
    // eslint-disable-next-line no-console
    console.warn(`[Analytics] "${name}" is not a registered funnel event -- add it to ANALYTICS_EVENTS in analyticsEvents.js.`);
  }
  trackEvent(name, properties);
};
