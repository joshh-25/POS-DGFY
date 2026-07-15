import { normalizeTrackedOrderEntry } from '../../../../tracking/storage.js';

export function unwrapFnbTrackingPayload(payload) {
  const raw = payload && typeof payload === 'object' ? payload : {};
  const root = raw?.data && typeof raw.data === 'object' ? raw.data : raw;
  const order = root?.order && typeof root.order === 'object'
    ? root.order
    : (raw?.order && typeof raw.order === 'object' ? raw.order : {});
  const location = root?.location && typeof root.location === 'object'
    ? root.location
    : (raw?.location && typeof raw.location === 'object' ? raw.location : {});
  return { raw, root, order, location };
}

function displaySnapshot(source) {
  return source?.display_snapshot && typeof source.display_snapshot === 'object'
    ? source.display_snapshot
    : (source?.display && typeof source.display === 'object' ? source.display : {});
}

function numberOrNull(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeItems(lines) {
  return lines.map((line, index) => {
    const name = String(line?.item_name || line?.name || line?.label || '').trim();
    if (!name) return null;
    const quantity = Number(line?.qty ?? line?.quantity ?? 1);
    const amount = line?.amount ?? line?.line_subtotal ?? line?.subtotal_amount ?? line?.sale_price ?? null;
    return {
      id: line?.id ?? line?.line_id ?? line?.item_id ?? `tracking-line-${index}`,
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

export function toFnbTrackingViewState(trackingPayload) {
  const { raw, root, order, location } = unwrapFnbTrackingPayload(trackingPayload?.raw || {});
  const normalized = trackingPayload?.normalized;
  const payloadDisplay = displaySnapshot(root);
  const orderDisplay = displaySnapshot(order);
  const items = Array.isArray(normalized?.items) && normalized.items.length > 0
    ? normalized.items
    : normalizeItems(resolveLines(root, order, payloadDisplay, orderDisplay));
  const source = normalized || {};

  return {
    ...raw,
    ...root,
    ...source,
    order,
    location,
    tracking_pin: String(source.reference || root?.tracking_pin || raw?.tracking_pin || order?.tracking_pin || '').trim(),
    status: String(source.statusCode || root?.status || raw?.status || order?.status || '').trim(),
    status_label: String(source.statusLabel || root?.status_label || raw?.status_label || order?.status_label || order?.status || '').trim(),
    order_method: String(source.orderMethod || root?.order_method || raw?.order_method || order?.order_method || 'delivery').trim(),
    createdAt: String(source.createdAt || order?.created_at || root?.created_at || raw?.created_at || '').trim(),
    updatedAt: String(source.updatedAt || order?.updated_at || root?.updated_at || raw?.updated_at || '').trim(),
    subtotalAmount: numberOrNull(source.subtotalAmount ?? root?.subtotal_amount ?? raw?.subtotal_amount ?? order?.subtotal_amount),
    deliveryFee: numberOrNull(source.deliveryFee ?? root?.delivery_fee ?? raw?.delivery_fee ?? order?.delivery_fee),
    discountAmount: numberOrNull(source.discountAmount ?? root?.discount_amount ?? raw?.discount_amount ?? order?.discount_amount),
    discountLabel: String(
      source.discountLabel
      || order?.discount_label_snapshot
      || root?.discount_label
      || raw?.discount_label
      || order?.discount_label
      || 'Promo / Discount'
    ).trim(),
    serviceFeeAmount: numberOrNull(source.serviceFeeAmount ?? root?.service_fee_amount ?? root?.service_fee ?? raw?.service_fee_amount ?? raw?.service_fee ?? order?.service_fee_amount ?? order?.service_fee),
    totalAmount: numberOrNull(source.totalAmount ?? root?.total_amount ?? raw?.total_amount ?? order?.total_amount ?? raw?.order_total),
    branchName: String(source.branchName || location?.name || payloadDisplay?.branch_name || orderDisplay?.branch_name || root?.branch_name || raw?.branch_name || '').trim(),
    branchAddress: String(source.branchAddress || location?.full_address || location?.address_line || payloadDisplay?.branch_address || orderDisplay?.branch_address || root?.branch_address || raw?.branch_address || '').trim(),
    deliveryAddress: String(source.deliveryAddress || order?.delivery_address || payloadDisplay?.delivery_address || orderDisplay?.delivery_address || root?.delivery_address || raw?.delivery_address || payloadDisplay?.customer_address || orderDisplay?.customer_address || root?.customer_address || raw?.customer_address || '').trim(),
    items
  };
}

export function buildFnbTrackedOrderEntry({ fallbackPin = '', normalizedEntity, payload, fallbackStore, routeSlug, toSlug }) {
  const { raw, root, order, location } = unwrapFnbTrackingPayload(payload);
  const resolvedStore = fallbackStore || null;
  const storeSlug = toSlug(resolvedStore?.slug || routeSlug);
  if (!storeSlug) return null;
  const view = toFnbTrackingViewState({ raw: payload, normalized: normalizedEntity });
  const trackingPin = String(view.tracking_pin || fallbackPin).trim().toUpperCase();
  if (!trackingPin) return null;
  return normalizeTrackedOrderEntry({
    tracking_pin: trackingPin,
    status: String(view.status || '').trim().toLowerCase(),
    status_label: String(view.status_label || '').trim(),
    order_method: String(view.order_method || 'delivery').trim().toLowerCase(),
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
    delivery_address: String(view.deliveryAddress || '').trim(),
    branch_address: String(view.branchAddress || '').trim(),
    store_slug: storeSlug,
    store_name: String(resolvedStore?.tenant_name || resolvedStore?.name || '').trim(),
    store_logo: String(resolvedStore?.storefront_profile_image_url || resolvedStore?.profile_image_url || '').trim()
  }, {
    storeSlug,
    storeName: String(resolvedStore?.tenant_name || resolvedStore?.name || '').trim(),
    storeLogo: String(resolvedStore?.storefront_profile_image_url || resolvedStore?.profile_image_url || '').trim(),
    branchName: String(view.branchName || location?.name || '').trim()
  });
}
