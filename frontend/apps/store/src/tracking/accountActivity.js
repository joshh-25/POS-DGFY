import { normalizeTrackedOrderEntry } from './storage.js';

export const DGFY_ACCOUNT_ORDER_ACTIVITY_TYPES = new Set(['order', 'pos_order', 'fnb_order']);
export const DGFY_ACCOUNT_BOOKING_ACTIVITY_TYPES = new Set(['service_booking', 'hospitality_booking']);

export const EMPTY_ACCOUNT_PANEL = Object.freeze({
  loading: false,
  error: '',
  me: null,
  memberships: [],
  activities: [],
  orders: [],
  bookings: [],
  notifications: [],
  unreadNotificationCount: 0,
  addresses: [],
  loyalty: null,
  businessCompanies: [],
  businessStepUp: { verified: false },
  affiliateEnrollments: [],
  affiliateEarnings: null,
  affiliateEarningsByStore: [],
  affiliatePayoutMethods: []
});

const normalizeTrackingSlug = (value = '') => String(value || '').trim().toLowerCase();

const firstNonEmptyLineCollection = (...candidates) => (
  candidates.find((candidate) => Array.isArray(candidate) && candidate.length > 0) || []
);

export const deriveAccountActivityCollections = ({ dashboardData = null, activitiesData = null } = {}) => {
  const activities = Array.isArray(activitiesData?.activities) && activitiesData.activities.length
    ? activitiesData.activities
    : (Array.isArray(dashboardData?.activities) ? dashboardData.activities : []);
  if (!activities.length) {
    return {
      activities: [],
      orders: Array.isArray(dashboardData?.orders) ? dashboardData.orders : [],
      bookings: Array.isArray(dashboardData?.bookings) ? dashboardData.bookings : []
    };
  }
  return {
    activities,
    orders: activities.filter((entry) => DGFY_ACCOUNT_ORDER_ACTIVITY_TYPES.has(String(entry?.type || '').trim().toLowerCase())),
    bookings: activities.filter((entry) => DGFY_ACCOUNT_BOOKING_ACTIVITY_TYPES.has(String(entry?.type || '').trim().toLowerCase()))
  };
};

export const mergeAccountActivityList = (list = [], activity = null) => {
  if (!activity?.reference && !activity?.activity_id) return Array.isArray(list) ? list : [];
  const nextActivity = { ...activity };
  const existing = Array.isArray(list) ? list : [];
  const matchKey = String(nextActivity.activity_id || nextActivity.reference || '').trim().toUpperCase();
  const withoutCurrent = existing.filter((entry) => {
    const entryKey = String(entry?.activity_id || entry?.reference || '').trim().toUpperCase();
    return entryKey !== matchKey;
  });
  return [nextActivity, ...withoutCurrent].sort((a, b) => (
    new Date(b?.occurred_at || b?.updated_at || b?.created_at || 0).getTime()
    - new Date(a?.occurred_at || a?.updated_at || a?.created_at || 0).getTime()
  ));
};

export const mergeAccountPanelActivity = (panel = EMPTY_ACCOUNT_PANEL, activity = null) => {
  const activities = mergeAccountActivityList(panel.activities, activity);
  const type = String(activity?.type || activity?.activity_type || '').trim().toLowerCase();
  const nextPanel = {
    ...panel,
    activities
  };
  if (DGFY_ACCOUNT_ORDER_ACTIVITY_TYPES.has(type)) {
    nextPanel.orders = mergeAccountActivityList(panel.orders, activity);
  }
  if (DGFY_ACCOUNT_BOOKING_ACTIVITY_TYPES.has(type)) {
    nextPanel.bookings = mergeAccountActivityList(panel.bookings, activity);
  }
  return nextPanel;
};

export const resolveStorefrontRouteSlug = (activity = {}, selectedStore = null, knownStores = []) => {
  if (!activity || typeof activity !== 'object') return '';
  const display = activity.display && typeof activity.display === 'object' ? activity.display : {};
  const explicitSlug = normalizeTrackingSlug(
    display.storefront_slug
    || activity.storefront_slug
    || activity.storefront?.slug
    || ''
  );
  if (explicitSlug) return explicitSlug;

  const activityStoreSlug = normalizeTrackingSlug(activity.store_slug || activity.store?.slug || '');
  if (activityStoreSlug && !activityStoreSlug.startsWith('token-')) {
    return activityStoreSlug;
  }

  const selectedSlug = normalizeTrackingSlug(selectedStore?.slug || '');
  const selectedName = String(selectedStore?.tenant_name || '').trim().toLowerCase();
  const activityName = String(activity.store_name || activity.store?.name || '').trim().toLowerCase();
  if (selectedSlug && selectedName && activityName && selectedName === activityName) {
    return selectedSlug;
  }

  if (activityName && Array.isArray(knownStores) && knownStores.length > 0) {
    const matchedStore = knownStores.find((store) => (
      String(store?.tenant_name || store?.name || '').trim().toLowerCase() === activityName
    ));
    const matchedSlug = normalizeTrackingSlug(matchedStore?.slug || '');
    if (matchedSlug) return matchedSlug;
  }

  return '';
};

export const mapAccountActivityToTrackedOrderEntry = (activity = {}, selectedStore = null, knownStores = []) => {
  if (!activity || typeof activity !== 'object') return null;
  const trackingPin = String(activity.reference || activity.tracking_pin || '').trim().toUpperCase();
  if (!trackingPin) return null;
  const display = activity.display && typeof activity.display === 'object'
    ? activity.display
    : (activity.display_snapshot && typeof activity.display_snapshot === 'object' ? activity.display_snapshot : {});
  const displayOrder = display.order && typeof display.order === 'object' ? display.order : {};
  const activityOrder = activity.order && typeof activity.order === 'object' ? activity.order : {};
  const lines = firstNonEmptyLineCollection(
    display.lines,
    display.transaction_lines,
    displayOrder.lines,
    displayOrder.transaction_lines,
    displayOrder.items,
    activityOrder.lines,
    activityOrder.transaction_lines,
    activityOrder.items,
    activity.summary_lines,
    activity.items,
    activity.transaction_lines,
    display.items,
    display.summary_lines
  );
  const firstLine = lines[0] || {};
  return normalizeTrackedOrderEntry({
    tracking_pin: trackingPin,
    status: activity.status || 'placed',
    status_label: activity.status_label || activity.status || 'In progress',
    order_method: display.order_method || activity.order_method || 'delivery',
    updated_at: activity.updated_at || activity.occurred_at || '',
    created_at: activity.created_at || activity.occurred_at || '',
    item_name: firstLine.label || firstLine.name || firstLine.item_name || '',
    item_count: lines.length || 1,
    items: lines.map((line, index) => {
      const quantity = Number(line?.quantity ?? line?.qty ?? 1);
      const lineSubtotal = Number(line?.line_subtotal ?? line?.amount ?? line?.subtotal_amount ?? line?.line_total_amount);
      const unitPrice = Number(line?.price ?? line?.sale_price ?? line?.unit_price);
      return {
        id: line?.item_id ?? `account-line-${trackingPin}-${index}`,
        item_id: line?.item_id ?? null,
        name: line?.label || line?.name || line?.item_name || '',
        qty: Number.isFinite(quantity) ? quantity : 1,
        amount: Number.isFinite(lineSubtotal)
          ? lineSubtotal
          : (Number.isFinite(unitPrice) && Number.isFinite(quantity) ? unitPrice * quantity : null),
        image_url: String(line?.image_url || line?.thumbnail_url || line?.thumbnail || line?.image || '').trim(),
        unit_of_measure: line?.unit_of_measure || ''
      };
    }),
    subtotal: activity.subtotal_amount ?? display.subtotal_amount ?? null,
    discount_amount: activity.discount_amount ?? display.discount_amount ?? displayOrder.discount_amount ?? activityOrder.discount_amount ?? null,
    discount_label: activity.discount_label_snapshot ?? activity.discount_label ?? display.discount_label ?? displayOrder.discount_label ?? '',
    delivery_fee: activity.delivery_fee ?? display.delivery_fee ?? null,
    service_fee: activity.service_fee_amount ?? activity.service_fee ?? display.service_fee_amount ?? display.service_fee ?? null,
    total_amount: activity.total_amount,
    delivery_address: activity.delivery_address ?? display.delivery_address ?? displayOrder.delivery_address ?? activity.customer_address ?? display.customer_address ?? displayOrder.customer_address ?? '',
    store_slug: resolveStorefrontRouteSlug(activity, selectedStore, knownStores),
    store_name: activity.store_name || activity.store?.name || '',
    branch_name: display.branch_name || displayOrder.branch_name || activity.branch_name || activityOrder.branch_name || '',
    branch_address: display.branch_address || displayOrder.branch_address || activity.branch_address || activityOrder.branch_address || ''
  });
};
