const SIMPLE_TRACKING_STATUS_FLOW = Object.freeze({
  delivery: [
    { id: 'placed', label: 'Order confirmed' },
    { id: 'confirmed', label: 'Confirmed by store' },
    { id: 'preparing', label: 'Preparing' },
    { id: 'out_for_delivery', label: 'Out for delivery' },
    { id: 'completed', label: 'Delivered' }
  ],
  pickup: [
    { id: 'placed', label: 'Order confirmed' },
    { id: 'confirmed', label: 'Confirmed by store' },
    { id: 'preparing', label: 'Preparing' },
    { id: 'ready_for_pickup', label: 'Ready for pickup' },
    { id: 'completed', label: 'Picked up' }
  ]
});

const TERMINAL_STATUSES = new Set(['completed', 'cancelled', 'rejected']);

export function getSimpleTrackingFlowForOrderMethod(orderMethod = 'delivery') {
  return orderMethod === 'pickup'
    ? SIMPLE_TRACKING_STATUS_FLOW.pickup
    : SIMPLE_TRACKING_STATUS_FLOW.delivery;
}

export function getSimpleCompletedTrackingLabel(orderMethod = 'delivery') {
  return orderMethod === 'pickup' ? 'Picked up' : 'Delivered';
}

function isTrackingPin(value = '') {
  const normalized = String(value || '').trim().toUpperCase();
  return /^SK-[A-Z0-9]{4,10}$/.test(normalized);
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
      id: line?.id ?? line?.line_id ?? line?.item_id ?? `simple-tracking-line-${index}`,
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

export const simpleTrackingAdapter = Object.freeze({
  mode: 'simple',
  canHandle: (input) => (
    String(input?.mode || '') === 'simple'
    && isTrackingPin(input?.rawReference)
    && Boolean(String(input?.storeSlug || '').trim())
  ),
  fetch: async (input, ctx) => {
    const pin = String(input?.rawReference || '').trim().toUpperCase();
    return ctx.requestJson(`/api/v1/store/track/${encodeURIComponent(pin)}`, { storeSlug: input.storeSlug });
  },
  normalize: (raw, input) => {
    const payload = raw?.data && typeof raw.data === 'object' ? raw.data : raw;
    const order = payload?.order && typeof payload.order === 'object' ? payload.order : {};
    const payloadDisplay = displaySnapshot(payload);
    const orderDisplay = displaySnapshot(order);
    const location = order?.location && typeof order.location === 'object'
      ? order.location
      : (payload?.location && typeof payload.location === 'object' ? payload.location : {});
    const statusCode = String(payload?.status || order?.status || '').trim().toLowerCase();
    const statusLabel = String(payload?.status_label || order?.status_label || payload?.status || order?.status || 'Order placed').trim();
    const reference = String(payload?.tracking_pin || order?.tracking_pin || input?.rawReference || '').trim().toUpperCase();
    const orderMethod = String(payload?.order_method || order?.order_method || 'delivery').trim().toLowerCase();
    const items = normalizeItems(resolveLines(payload, order, payloadDisplay, orderDisplay));
    const flow = getSimpleTrackingFlowForOrderMethod(orderMethod);
    // Phase 211 (#1180). `packed` is a Retail-only step and deliberately absent from this mode's
    // flow. If it ever appears here (direct API call -- the server gate is mode-agnostic, see
    // posUseCases.js's ONLINE_FULFILLMENT_TRANSITIONS), render it at the `preparing` position
    // rather than silently rewinding the timeline to step 0.
    const timelineStatusCode = statusCode === 'packed' ? 'preparing' : statusCode;
    const activeStepIndex = Math.max(0, flow.findIndex((step) => step.id === timelineStatusCode));

    return {
      mode: 'simple',
      kind: 'order',
      reference,
      statusCode,
      statusLabel,
      // Phase 210 (#1179). Merchant-attributed copy on a rejected order -- never DGFY's own
      // statement.
      rejectionReason: String(payload?.rejection_reason || order?.rejection_reason || '').trim() || null,
      isTerminal: TERMINAL_STATUSES.has(statusCode),
      orderMethod,
      updatedAt: String(order?.updated_at || payload?.updated_at || '').trim() || null,
      createdAt: String(order?.created_at || payload?.created_at || '').trim() || null,
      etaMinutes: numberOrNull(order?.estimated_wait_minutes ?? payload?.estimated_wait_minutes),
      subtotalAmount: numberOrNull(order?.subtotal_amount ?? payload?.subtotal_amount),
      deliveryFee: numberOrNull(order?.delivery_fee ?? payload?.delivery_fee),
      discountAmount: numberOrNull(order?.discount_amount ?? payload?.discount_amount),
      discountLabel: String(
        order?.discount_label_snapshot
        || order?.discount_label
        || payload?.discount_label
        || 'Promo / Discount'
      ).trim(),
      serviceFeeAmount: numberOrNull(order?.service_fee_amount ?? order?.service_fee ?? payload?.service_fee_amount ?? payload?.service_fee),
      totalAmount: numberOrNull(order?.total_amount ?? payload?.total_amount ?? payload?.order_total),
      branchName: String(location?.name || payloadDisplay?.branch_name || orderDisplay?.branch_name || payload?.branch_name || '').trim() || null,
      branchAddress: String(location?.full_address || location?.address_line || payloadDisplay?.branch_address || orderDisplay?.branch_address || payload?.branch_address || '').trim() || null,
      deliveryAddress: String(order?.delivery_address || payload?.delivery_address || payload?.customer_address || payloadDisplay?.delivery_address || orderDisplay?.delivery_address || '').trim() || null,
      items,
      timeline: flow.map((step, index) => ({
        id: step.id,
        label: step.label,
        state: index === activeStepIndex ? 'active' : (index < activeStepIndex ? 'done' : 'pending')
      })),
      uiHints: {
        icon: orderMethod === 'pickup' ? 'ShoppingBag' : 'PackageCheck',
        tone: orderMethod === 'pickup' ? 'pickup' : 'delivery'
      }
    };
  }
});
