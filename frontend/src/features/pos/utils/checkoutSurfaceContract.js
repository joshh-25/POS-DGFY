export const DGFY_CONVENIENCE_FEE_LABEL = 'DGFY convenience fee';
export const DGFY_CONVENIENCE_FEE_RATE = 0.01;

export const buildPosCheckoutPayload = ({
  idempotencyKey,
  terminalId = '',
  selectedLocationId = null,
  orderMethod = 'dine_in',
  paymentType = 'cash',
  calculatedDiscountAmount = 0,
  selectedDiscount = null,
  activeShiftId = null,
  fnbContext = null,
  buyerFiscal = null,
  cart = []
} = {}) => {
  const normalizedFnbContext = fnbContext && typeof fnbContext === 'object' ? fnbContext : {};
  const normalizedBuyerFiscal = buyerFiscal && typeof buyerFiscal === 'object' ? buyerFiscal : {};

  return {
    idempotency_key: idempotencyKey,
    terminal_id: String(terminalId || '').trim() || undefined,
    location_id: selectedLocationId || undefined,
    order_method: orderMethod,
    payment_type: paymentType,
    payment_handoff_mode: paymentType === 'cash' ? 'internal' : 'external',
    discount_amount: Number(calculatedDiscountAmount || 0),
    discount_profile_name: selectedDiscount?.name || null,
    discount_rate: selectedDiscount ? Number(selectedDiscount.percentage) : null,
    shift_id: activeShiftId || undefined,
    fnb_check_id: normalizedFnbContext?.fnb_check_id || undefined,
    fnb_table_id: normalizedFnbContext?.fnb_table_id || undefined,
    fnb_table_label_snapshot: normalizedFnbContext?.fnb_table_label_snapshot || undefined,
    fnb_guest_count: normalizedFnbContext?.fnb_guest_count || undefined,
    fnb_server_id: normalizedFnbContext?.fnb_server_id || undefined,
    restaurant_service_charge: normalizedFnbContext?.restaurant_service_charge || undefined,
    buyer_name: String(normalizedBuyerFiscal?.buyer_name || '').trim() || undefined,
    buyer_tin: String(normalizedBuyerFiscal?.buyer_tin || '').trim() || undefined,
    buyer_business_style: String(normalizedBuyerFiscal?.buyer_business_style || '').trim() || undefined,
    buyer_address: String(normalizedBuyerFiscal?.buyer_address || '').trim() || undefined,
    lines: (Array.isArray(cart) ? cart : []).map((line) => ({
      item_id: line.item_id,
      quantity: Number(line.quantity),
      sale_price: Number(line.sale_price),
      price_override_reason: String(line.price_override_reason || '').trim() || undefined,
      course: line.course || normalizedFnbContext?.default_course || undefined,
      line_modifiers: line.line_modifiers || undefined,
      special_instructions: line.special_instructions || undefined,
      kitchen_station_id: line.kitchen_station_id || undefined,
      scan_metadata: line.scan_metadata || undefined
    }))
  };
};
