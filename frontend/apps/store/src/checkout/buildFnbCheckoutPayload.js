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
  fnbScheduleMode,
  fnbScheduledFor,
  fnbSpecialInstructions,
  cart
}) => ({
  location_id: selectedLocationId ?? selectedStore?.location_id,
  order_method: orderMethod,
  customer_name: String(customerName || '').trim(),
  customer_phone: String(customerPhone || '').trim(),
  customer_email: String(customerEmail || '').trim(),
  promo_code: String(promoCode || '').trim().toUpperCase(),
  delivery_address: isDeliveryOrder ? String(deliveryAddress || '').trim() : '',
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
            modifier_option_id: Number(entry.modifier_option_id)
          }))
        }
      : {})
  }))
});
