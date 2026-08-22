const toNumberOrNull = (value) => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
};

export const buildFnbCheckoutPayload = ({
  selectedLocationId,
  selectedStore,
  orderMethod,
  customerName,
  customerPhone,
  customerEmail,
  isDeliveryOrder,
  deliveryAddress,
  customerPin,
  promoCode,
  voucherCode,
  fnbScheduleMode,
  fnbScheduledFor,
  fnbSpecialInstructions,
  cart,
  // Phase 150 (#866): the customer's pay-in-full-vs-downpayment election, only meaningful at a
  // payment_mode='customer_choice' store -- storeValidator.js ignores it otherwise. Defaults to
  // 'full' so every pre-#866 caller of this shared builder (which never passes this) is unaffected.
  paymentElection = 'full'
}) => ({
  location_id: selectedLocationId ?? selectedStore?.location_id,
  order_method: orderMethod,
  customer_name: String(customerName || '').trim(),
  customer_phone: String(customerPhone || '').trim(),
  customer_email: String(customerEmail || '').trim(),
  payment_election: paymentElection === 'downpayment' ? 'downpayment' : 'full',
  promo_code: String(promoCode || '').trim().toUpperCase(),
  // #672: voucher_code is a separate field from promo_code -- the two are independent checkout
  // discounts today (ADR 0066/#453's eventual promo->voucher_kind generalization hasn't happened
  // yet), so this does not touch the promo_code line above.
  voucher_code: String(voucherCode || '').trim().toUpperCase(),
  delivery_address: String(deliveryAddress || '').trim(),
  delivery_latitude: isDeliveryOrder ? toNumberOrNull(customerPin?.latitude) : null,
  delivery_longitude: isDeliveryOrder ? toNumberOrNull(customerPin?.longitude) : null,
  scheduled_for: fnbScheduleMode === 'schedule' && fnbScheduledFor ? new Date(fnbScheduledFor).toISOString() : null,
  special_instructions: String(fnbSpecialInstructions || '').trim(),
  lines: (Array.isArray(cart) ? cart : []).map((line) => ({
    item_id: Number(line.item_id),
    quantity: Number(line.quantity),
    ...(Array.isArray(line.line_modifiers) && line.line_modifiers.length > 0
      ? {
          line_modifiers: line.line_modifiers.map((entry) => ({
            modifier_group_id: Number(entry.modifier_group_id),
            modifier_option_id: Number(entry.modifier_option_id),
            quantity: Math.min(99, Math.max(1, Number.parseInt(entry.quantity || 1, 10) || 1))
          }))
        }
      : {})
  }))
});
