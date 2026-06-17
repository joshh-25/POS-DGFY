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
  fnbScheduleMode,
  fnbScheduledFor,
  fnbSpecialInstructions,
  cart
}) => ({
  location_id: selectedLocationId ?? selectedStore?.location_id,
  order_method: orderMethod,
  customer_name: customerName,
  customer_phone: customerPhone,
  customer_email: customerEmail,
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
