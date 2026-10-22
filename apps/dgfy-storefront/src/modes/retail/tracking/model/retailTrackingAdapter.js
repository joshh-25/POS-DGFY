import { getOrderTrackingFlow, getOrderTrackingTimeline } from '../../../../shared/tracking/directDeliveryTimeline.js';

const TERMINAL_STATUSES = new Set(['completed', 'cancelled', 'rejected']);

export function getTrackingFlowForOrderMethod(orderMethod = 'delivery') {
  return getOrderTrackingFlow(orderMethod, true);
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

export const RetailTrackingAdapter = Object.freeze({
  mode: 'retail',
  canHandle: (input) => (
    String(input?.mode || '') === 'retail'
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
    const payloadDisplay = payload?.display_snapshot && typeof payload.display_snapshot === 'object'
      ? payload.display_snapshot
      : (payload?.display && typeof payload.display === 'object' ? payload.display : {});
    const orderDisplay = order?.display_snapshot && typeof order.display_snapshot === 'object'
      ? order.display_snapshot
      : (order?.display && typeof order.display === 'object' ? order.display : {});
    const location = order?.location && typeof order.location === 'object'
      ? order.location
      : (payload?.location && typeof payload.location === 'object' ? payload.location : {});
    const statusCode = String(payload?.status || order?.status || '').trim().toLowerCase();
    const statusLabel = String(payload?.status_label || order?.status_label || payload?.status || order?.status || 'Order placed').trim();
    const reference = String(payload?.tracking_pin || order?.tracking_pin || input?.rawReference || '').trim().toUpperCase();
    const orderMethod = String(payload?.order_method || order?.order_method || 'delivery').trim().toLowerCase();
    const delivery = order?.delivery || payload?.delivery || null;
    const orderItems = Array.isArray(order?.items)
      ? order.items
      : (Array.isArray(payload?.items) ? payload.items : []);
    const orderLines = Array.isArray(order?.lines)
      ? order.lines
      : (
        Array.isArray(payload?.lines) ? payload.lines
          : (Array.isArray(orderDisplay?.lines) ? orderDisplay.lines
            : (Array.isArray(payloadDisplay?.lines) ? payloadDisplay.lines : []))
      );
    const baseRows = orderItems.length > 0 ? orderItems : orderLines;
    const itemRows = baseRows.map((line) => {
      const quantity = Number.isFinite(Number(line?.quantity ?? line?.qty))
        ? Number(line?.quantity ?? line?.qty)
        : null;
      const lineAmount = Number(
        line?.line_subtotal
        ?? line?.subtotal_amount
        ?? line?.amount
        ?? line?.line_total_amount
        ?? line?.line_total
      );
      const salePrice = Number(line?.sale_price ?? line?.unit_price ?? line?.price);
      const computedAmount = Number.isFinite(lineAmount)
        ? lineAmount
        : (Number.isFinite(salePrice) && Number.isFinite(quantity) ? salePrice * quantity : null);
      return {
        id: line?.line_id ?? line?.item_id ?? line?.id ?? null,
        item_id: line?.item_id ?? null,
        name: String(line?.label || line?.item_name || line?.name || '').trim(),
        qty: quantity,
        amount: Number.isFinite(Number(computedAmount)) ? Number(computedAmount) : null,
        image_url: String(line?.image_url || line?.thumbnail_url || line?.image || '').trim() || null,
        unit_of_measure: String(line?.unit_of_measure || line?.variant_label || line?.size_label || '').trim() || null
      };
    }).filter((line) => Boolean(line.name));
    return {
      mode: 'retail',
      kind: 'order',
      reference,
      statusCode,
      statusLabel,
      // Phase 210 (#1179). Merchant-attributed copy on a rejected order -- never DGFY's own
      // statement.
      rejectionReason: String(payload?.rejection_reason || order?.rejection_reason || '').trim() || null,
      cancellationReason: String(payload?.cancellation_reason || order?.cancellation_reason || '').trim() || null,
      delivery,
      isTerminal: TERMINAL_STATUSES.has(statusCode),
      orderMethod,
      specialInstructions: String(order?.special_instructions || payload?.special_instructions || orderDisplay?.special_instructions || payloadDisplay?.special_instructions || '').trim() || null,
      updatedAt: String(order?.updated_at || payload?.updated_at || '').trim() || null,
      createdAt: String(order?.created_at || payload?.created_at || '').trim() || null,
      etaMinutes: Number.isFinite(Number(order?.estimated_wait_minutes ?? payload?.estimated_wait_minutes))
        ? Number(order?.estimated_wait_minutes ?? payload?.estimated_wait_minutes)
        : null,
      subtotalAmount: Number.isFinite(Number(order?.subtotal_amount ?? payload?.subtotal_amount))
        ? Number(order?.subtotal_amount ?? payload?.subtotal_amount)
        : null,
      deliveryFee: Number.isFinite(Number(order?.delivery_fee ?? payload?.delivery_fee))
        ? Number(order?.delivery_fee ?? payload?.delivery_fee)
        : null,
      discountAmount: Number.isFinite(Number(
        order?.discount_amount
        ?? payload?.discount_amount
        ?? orderDisplay?.discount_amount
        ?? payloadDisplay?.discount_amount
      ))
        ? Number(order?.discount_amount ?? payload?.discount_amount ?? orderDisplay?.discount_amount ?? payloadDisplay?.discount_amount)
        : null,
      discountLabel: String(
        order?.discount_label_snapshot
        || order?.discount_label
        || payload?.discount_label
        || orderDisplay?.discount_label
        || payloadDisplay?.discount_label
        || 'Promo / Discount'
      ).trim(),
      serviceFeeAmount: Number.isFinite(Number(order?.service_fee_amount ?? order?.service_fee ?? payload?.service_fee_amount ?? payload?.service_fee))
        ? Number(order?.service_fee_amount ?? order?.service_fee ?? payload?.service_fee_amount ?? payload?.service_fee)
        : null,
      customerProcessingFeeAmount: Number.isFinite(Number(order?.customer_processing_fee_amount ?? payload?.customer_processing_fee_amount))
        ? Number(order?.customer_processing_fee_amount ?? payload?.customer_processing_fee_amount)
        : null,
      customerProcessingFeeLabel: String(order?.customer_processing_fee_label_snapshot || payload?.customer_processing_fee_label || '').trim(),
      totalAmount: Number.isFinite(Number(order?.total_amount ?? payload?.total_amount))
        ? Number(order?.total_amount ?? payload?.total_amount)
        : null,
      branchName: String(
        location?.name
        || payloadDisplay?.branch_name
        || orderDisplay?.branch_name
        || payload?.branch_name
        || ''
      ).trim() || null,
      branchAddress: String(
        location?.full_address
        || location?.address_line
        || payloadDisplay?.branch_address
        || orderDisplay?.branch_address
        || payload?.branch_address
        || ''
      ).trim() || null,
      deliveryAddress: String(
        order?.delivery_address
        || payload?.delivery_address
        || payload?.customer_address
        || payloadDisplay?.delivery_address
        || orderDisplay?.delivery_address
        || payloadDisplay?.customer_address
        || orderDisplay?.customer_address
        || ''
      ).trim() || null,
      items: itemRows,
      timeline: getOrderTrackingTimeline(orderMethod, statusCode, delivery, true),
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
