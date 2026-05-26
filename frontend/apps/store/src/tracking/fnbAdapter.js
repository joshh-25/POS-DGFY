const FNB_TRACKING_STATUS_FLOW = Object.freeze({
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

export function getTrackingFlowForOrderMethod(orderMethod = 'delivery') {
  return orderMethod === 'pickup'
    ? FNB_TRACKING_STATUS_FLOW.pickup
    : FNB_TRACKING_STATUS_FLOW.delivery;
}

export function getCompletedTrackingLabel(orderMethod = 'delivery') {
  if (orderMethod === 'pickup') return 'Picked up';
  if (orderMethod === 'dine_in') return 'Served';
  return 'Delivered';
}

function isTrackingPin(value = '') {
  const normalized = String(value || '').trim().toUpperCase();
  return /^SK-[A-Z0-9]{4,10}$/.test(normalized);
}

export const fnbTrackingAdapter = Object.freeze({
  mode: 'fnb',
  canHandle: (input) => (
    String(input?.mode || '') === 'fnb'
    && isTrackingPin(input?.rawReference)
    && Boolean(String(input?.storeSlug || '').trim())
  ),
  fetch: async (input, ctx) => {
    const pin = String(input?.rawReference || '').trim().toUpperCase();
    return ctx.requestJson(`/api/v1/store/track/${encodeURIComponent(pin)}`, { storeSlug: input.storeSlug });
  },
  normalize: (raw, input) => {
    const statusCode = String(raw?.status || '').trim().toLowerCase();
    const statusLabel = String(raw?.status_label || raw?.status || 'Order placed').trim();
    const reference = String(raw?.tracking_pin || input?.rawReference || '').trim().toUpperCase();
    const orderMethod = String(raw?.order_method || raw?.order?.order_method || 'delivery').trim().toLowerCase();
    const orderItems = Array.isArray(raw?.order?.items) ? raw.order.items : [];
    const orderLines = Array.isArray(raw?.order?.lines) ? raw.order.lines : [];
    const baseRows = orderItems.length > 0 ? orderItems : orderLines;
    const itemRows = baseRows.map((line) => {
      const quantity = Number.isFinite(Number(line?.quantity)) ? Number(line.quantity) : null;
      const lineAmount = Number(line?.line_subtotal ?? line?.line_total_amount ?? line?.line_total);
      const salePrice = Number(line?.sale_price ?? line?.unit_price ?? line?.price);
      const computedAmount = Number.isFinite(lineAmount)
        ? lineAmount
        : (Number.isFinite(salePrice) && Number.isFinite(quantity) ? salePrice * quantity : null);
      return {
        id: line?.line_id ?? line?.item_id ?? line?.id ?? null,
        name: String(line?.item_name || line?.name || '').trim(),
        qty: quantity,
        amount: Number.isFinite(Number(computedAmount)) ? Number(computedAmount) : null
      };
    }).filter((line) => Boolean(line.name));
    return {
      mode: 'fnb',
      kind: 'order',
      reference,
      statusCode,
      statusLabel,
      isTerminal: TERMINAL_STATUSES.has(statusCode),
      orderMethod,
      updatedAt: String(raw?.order?.updated_at || '').trim() || null,
      createdAt: String(raw?.order?.created_at || '').trim() || null,
      etaMinutes: Number.isFinite(Number(raw?.estimated_wait_minutes)) ? Number(raw.estimated_wait_minutes) : null,
      subtotalAmount: Number.isFinite(Number(raw?.order?.subtotal_amount)) ? Number(raw.order.subtotal_amount) : null,
      deliveryFee: Number.isFinite(Number(raw?.order?.delivery_fee)) ? Number(raw.order.delivery_fee) : null,
      serviceFeeAmount: Number.isFinite(Number(raw?.order?.service_fee_amount)) ? Number(raw.order.service_fee_amount) : null,
      totalAmount: Number.isFinite(Number(raw?.order?.total_amount)) ? Number(raw.order.total_amount) : null,
      branchName: String(raw?.location?.name || '').trim() || null,
      deliveryAddress: String(raw?.order?.delivery_address || raw?.delivery_address || '').trim() || null,
      items: itemRows,
      timeline: getTrackingFlowForOrderMethod(orderMethod).map((step, index, allSteps) => {
        const activeIndex = Math.max(0, allSteps.findIndex((item) => item.id === statusCode));
        const isCompleted = index < activeIndex;
        const isActive = index === activeIndex || (statusCode === 'completed' && index === allSteps.length - 1);
        return {
          id: step.id,
          label: step.label,
          state: isActive ? 'active' : (isCompleted ? 'done' : 'pending')
        };
      }),
      uiHints: {
        icon: orderMethod === 'pickup' ? 'ShoppingBag' : 'Bike',
        tone: orderMethod === 'pickup' ? 'pickup' : 'delivery',
        badgeText: orderMethod === 'pickup' ? 'PICKUP' : 'DELIVERY',
        primaryColor: orderMethod === 'pickup' ? '#0284c7' : '#ea580c',
        bgColor: orderMethod === 'pickup' ? '#f0f9ff' : '#fff7ed',
        borderColor: orderMethod === 'pickup' ? '#bae6fd' : '#fed7aa',
      },
      raw
    };
  }
});
