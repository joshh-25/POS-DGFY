import { normalizeTrackedOrderEntry } from '../../../../tracking/storage.js';

function unwrapSimpleTrackingPayload(payload) {
  const raw = payload && typeof payload === 'object' ? payload : {};
  const root = raw?.data && typeof raw.data === 'object' ? raw.data : raw;
  const order = root?.order && typeof root.order === 'object' ? root.order : {};
  const location = root?.location && typeof root.location === 'object' ? root.location : {};
  return { raw, root, order, location };
}

function numberOrNull(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function displaySnapshot(source) {
  return source?.display_snapshot && typeof source.display_snapshot === 'object'
    ? source.display_snapshot
    : (source?.display && typeof source.display === 'object' ? source.display : {});
}

function normalizeItems(lines = []) {
  return lines.map((line, index) => {
    const name = String(line?.item_name || line?.name || line?.label || '').trim();
    if (!name) return null;
    const quantity = Number(line?.qty ?? line?.quantity ?? 1);
    const amount = line?.amount ?? line?.line_subtotal ?? line?.subtotal_amount ?? line?.sale_price ?? line?.price ?? null;
    return {
      id: line?.id ?? line?.line_id ?? line?.item_id ?? `simple-tracked-item-${index}`,
      item_id: numberOrNull(line?.item_id),
      name,
      qty: Number.isFinite(quantity) ? quantity : 1,
      amount: numberOrNull(amount),
      image_url: String(line?.image_url || line?.thumbnail || line?.thumbnail_url || line?.image || '').trim(),
      unit_of_measure: String(line?.unit_of_measure || line?.variant_label || line?.size_label || '').trim()
    };
  }).filter(Boolean);
}

function resolveLines(root, order, payloadDisplay, orderDisplay) {
  return Array.isArray(order?.lines) ? order.lines
    : (Array.isArray(order?.items) ? order.items
      : (Array.isArray(root?.lines) ? root.lines
        : (Array.isArray(root?.items) ? root.items
          : (Array.isArray(payloadDisplay?.lines) ? payloadDisplay.lines
            : (Array.isArray(orderDisplay?.lines) ? orderDisplay.lines : orderDisplay?.items || [])))));
}

export function toSimpleTrackingViewState(trackingPayload) {
  const { raw, root, order, location } = unwrapSimpleTrackingPayload(trackingPayload?.raw || {});
  const normalized = trackingPayload?.normalized || {};
  const payloadDisplay = displaySnapshot(root);
  const orderDisplay = displaySnapshot(order);
  const normalizedItems = Array.isArray(normalized.items) ? normalized.items : [];
  const items = normalizedItems.length > 0
    ? normalizedItems
    : normalizeItems(resolveLines(root, order, payloadDisplay, orderDisplay));

  return {
    ...raw,
    ...root,
    ...normalized,
    order,
    location,
    tracking_pin: String(normalized.reference || root?.tracking_pin || raw?.tracking_pin || order?.tracking_pin || '').trim().toUpperCase(),
    status: String(normalized.statusCode || root?.status || raw?.status || order?.status || '').trim().toLowerCase(),
    status_label: String(normalized.statusLabel || root?.status_label || raw?.status_label || order?.status_label || order?.status || '').trim(),
    order_method: String(normalized.orderMethod || root?.order_method || raw?.order_method || order?.order_method || 'delivery').trim().toLowerCase(),
    createdAt: String(normalized.createdAt || order?.created_at || root?.created_at || raw?.created_at || '').trim(),
    updatedAt: String(normalized.updatedAt || order?.updated_at || root?.updated_at || raw?.updated_at || '').trim(),
    subtotalAmount: numberOrNull(normalized.subtotalAmount ?? root?.subtotal_amount ?? raw?.subtotal_amount ?? order?.subtotal_amount),
    deliveryFee: numberOrNull(normalized.deliveryFee ?? root?.delivery_fee ?? raw?.delivery_fee ?? order?.delivery_fee),
    discountAmount: numberOrNull(normalized.discountAmount ?? root?.discount_amount ?? raw?.discount_amount ?? order?.discount_amount),
    discountLabel: String(normalized.discountLabel || order?.discount_label_snapshot || root?.discount_label || raw?.discount_label || order?.discount_label || 'Promo / Discount').trim(),
    serviceFeeAmount: numberOrNull(normalized.serviceFeeAmount ?? root?.service_fee_amount ?? root?.service_fee ?? raw?.service_fee_amount ?? raw?.service_fee ?? order?.service_fee_amount ?? order?.service_fee),
    // RF-4 (PR #753 review): order.total_amount (server-persisted) now outranks root/raw's --
    // see retailTrackingPayload.js's own copy of this note for the full reasoning.
    totalAmount: numberOrNull(normalized.totalAmount ?? order?.total_amount ?? root?.total_amount ?? raw?.total_amount ?? raw?.order_total),
    // Phase 142 (#823): order-sourced only -- serializeOrderBase now returns these (previously
    // omitted entirely), null for any order that isn't partially_paid.
    paymentStatus: String(normalized.paymentStatus || order?.payment_status || root?.payment_status || raw?.payment_status || '').trim().toLowerCase(),
    amountPaid: numberOrNull(normalized.amountPaid ?? order?.amount_paid ?? root?.amount_paid ?? raw?.amount_paid),
    balanceDue: numberOrNull(normalized.balanceDue ?? order?.balance_due ?? root?.balance_due ?? raw?.balance_due),
    branchName: String(normalized.branchName || location?.name || payloadDisplay?.branch_name || orderDisplay?.branch_name || root?.branch_name || raw?.branch_name || '').trim(),
    branchAddress: String(normalized.branchAddress || location?.full_address || location?.address_line || payloadDisplay?.branch_address || orderDisplay?.branch_address || root?.branch_address || raw?.branch_address || '').trim(),
    deliveryAddress: String(normalized.deliveryAddress || order?.delivery_address || payloadDisplay?.delivery_address || orderDisplay?.delivery_address || root?.delivery_address || raw?.delivery_address || payloadDisplay?.customer_address || orderDisplay?.customer_address || root?.customer_address || raw?.customer_address || '').trim(),
    items
  };
}

export function buildSimpleTrackedOrderEntry({ fallbackPin = '', normalizedEntity, payload, fallbackStore, routeSlug, toSlug }) {
  const { raw, root, order, location } = unwrapSimpleTrackingPayload(payload);
  const resolvedStore = fallbackStore || null;
  const storeSlug = toSlug(resolvedStore?.slug || routeSlug);
  if (!storeSlug) return null;
  const view = toSimpleTrackingViewState({ raw: payload, normalized: normalizedEntity });
  const trackingPin = String(view.tracking_pin || fallbackPin).trim().toUpperCase();
  if (!trackingPin) return null;

  return normalizeTrackedOrderEntry({
    tracking_pin: trackingPin,
    status: view.status,
    status_label: view.status_label,
    order_method: view.order_method,
    updated_at: String(view.updatedAt || order?.updated_at || root?.updated_at || raw?.updated_at || new Date().toISOString()).trim(),
    created_at: String(view.createdAt || order?.created_at || root?.created_at || raw?.created_at || new Date().toISOString()).trim(),
    item_name: String(view.items?.[0]?.name || order?.item_name || order?.name || root?.order_name || raw?.order_name || '').trim(),
    item_count: view.items?.length || 1,
    items: view.items,
    subtotal: view.subtotalAmount,
    discount_amount: view.discountAmount,
    discount_label: view.discountLabel,
    total_amount: view.totalAmount,
    delivery_fee: view.deliveryFee,
    service_fee: view.serviceFeeAmount,
    branch_name: String(view.branchName || location?.name || '').trim(),
    eta_minutes: numberOrNull(normalizedEntity?.etaMinutes ?? root?.estimated_wait_minutes ?? raw?.estimated_wait_minutes),
    delivery_address: view.deliveryAddress,
    branch_address: view.branchAddress,
    store_slug: storeSlug,
    store_name: String(resolvedStore?.tenant_name || resolvedStore?.name || '').trim(),
    store_logo: String(resolvedStore?.storefront_profile_image_url || resolvedStore?.profile_image_url || '').trim()
  }, {
    storeSlug,
    storeName: String(resolvedStore?.tenant_name || resolvedStore?.name || '').trim(),
    branchName: String(view.branchName || location?.name || '').trim()
  });
}
