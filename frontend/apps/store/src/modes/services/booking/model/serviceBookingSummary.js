import { formatServiceAppointmentSummary } from './serviceBookingSchedule.js';

const defaultMoney = (value) => String(value);

// Placeholder add-on catalog shared by the Add-ons step (ServiceBookingAddOnsStep.jsx, where
// customers toggle these per cart line) and this summary model (where selections are grouped
// for the "Services Ordered" breakdown). No per-service add-on data model exists in the backend
// yet, so this is a fixed, presentational list — see ServiceBookingAddOnsStep.jsx's own note.
export const SERVICE_ADD_ON_OPTIONS = [
  { key: 'detergent', label: 'Additional detergent', amount: '+₱20.00' },
  { key: 'fabric_conditioner', label: 'Additional fabric conditioner', amount: '+₱10.00' },
];

export const buildServiceBookingSummaryModel = ({
  activeBookingService,
  firstServiceLine,
  hasServiceCart,
  money = defaultMoney,
  serviceAppointmentAt,
  serviceCartLines = [],
  serviceCartTotal = 0,
  serviceDraftQuantity = 1,
  serviceIntakeResponses = {},
  serviceLineAddOns = {},
  serviceOrderMethod = 'delivery'
}) => {
  const safeCartLines = Array.isArray(serviceCartLines) ? serviceCartLines : [];
  const bookingSummaryQuantity = hasServiceCart
    ? safeCartLines.reduce((sum, line) => sum + Math.max(1, Number(line.quantity || 1)), 0)
    : Math.max(1, Number(serviceDraftQuantity || 1));
  const bookingSummaryAmount = hasServiceCart
    ? serviceCartTotal
    : ((Number(activeBookingService?.default_sale_price ?? 0) || 0) * Math.max(1, Number(serviceDraftQuantity || 1)));
  const serviceBookingSummaryTitle = hasServiceCart
    ? (safeCartLines.length > 1
      ? `${safeCartLines.length} Services`
      : (firstServiceLine?.variantName || firstServiceLine?.name || 'Service booking'))
    : (activeBookingService?.variantName || activeBookingService?.name || 'Service booking');
  const serviceBookingSummarySchedule = hasServiceCart
    ? (() => {
      const uniqueSchedules = Array.from(new Set(
        safeCartLines
          .map((line) => formatServiceAppointmentSummary(line.service_schedule_at))
          .filter((value) => value && value !== 'Select a schedule')
      ));
      if (uniqueSchedules.length === 1) return uniqueSchedules[0];
      if (uniqueSchedules.length > 1) return 'Varies by service';
      return formatServiceAppointmentSummary(serviceAppointmentAt);
    })()
    : formatServiceAppointmentSummary(serviceAppointmentAt);
  const reviewServiceLines = safeCartLines.map((line, index) => ({
    key: String(line.cart_line_id || line.item_id || index),
    title: line.variantName || line.name || `Service ${index + 1}`,
    editFieldKey: 'preferred_date',
    rows: [
      { label: 'Service', value: line.variantName || line.name || 'Service', fieldKey: 'preferred_date' },
      { label: 'Preferred Schedule', value: formatServiceAppointmentSummary(line.service_schedule_at), fieldKey: 'preferred_date' },
      ...(line.service_detail?.service_area_type || line.serviceAreaLabel
        ? [{ label: 'Service Variant', value: line.service_detail?.service_area_type || line.serviceAreaLabel, fieldKey: 'unit_type' }]
        : []),
      { label: 'Number of Units', value: String(Math.max(1, Number(line.quantity || 1))), fieldKey: 'unit_count' },
      { label: 'Additional Instructions', value: String(line.service_notes || '').trim() || 'No additional instructions.', fieldKey: 'service_notes' },
    ],
  }));
  const serviceBookingSummaryRows = [
    { label: 'Services', value: serviceBookingSummaryTitle },
    { label: 'Schedule', value: serviceBookingSummarySchedule },
    { label: 'Fulfillment type', value: serviceOrderMethod === 'pickup' ? 'Pickup' : 'Delivery' },
  ];

  const summarySource = hasServiceCart
    ? safeCartLines
    : (activeBookingService
      ? [{
        item_id: activeBookingService.item_id,
        cart_line_id: activeBookingService.item_id,
        name: activeBookingService.name,
        variantName: activeBookingService.variantName || '',
        quantity: Math.max(1, Number(serviceDraftQuantity || 1)),
        price: Number(activeBookingService.default_sale_price ?? 0) || 0,
        service_schedule_at: serviceAppointmentAt,
        service_notes: String(serviceIntakeResponses.special_instructions || serviceIntakeResponses.instructions || '').trim(),
        durationLabel: activeBookingService.durationLabel || '',
        service_detail: activeBookingService.service_detail || null,
      }]
      : []);
  const serviceBookingSummaryLineItems = summarySource.map((line, index) => {
    const lineDuration = String(
      line.durationLabel
      || activeBookingService?.durationLabel
      || ''
    ).trim();
    const variant = String(line.service_detail?.service_area_type || line.serviceAreaLabel || line.variantName || '').trim();
    return {
      key: String(line.cart_line_id || line.item_id || index),
      title: String(line.variantName || line.name || `Service ${index + 1}`).trim(),
      variant,
      schedule: formatServiceAppointmentSummary(line.service_schedule_at || serviceAppointmentAt),
      quantity: String(Math.max(1, Number(line.quantity || 1))),
      duration: lineDuration,
      notes: String(line.service_notes || '').trim(),
      amount: money((Number(line.price || 0) || 0) * Math.max(1, Number(line.quantity || 1))),
    };
  });

  // Groups cart lines by (service + exact add-on combination) so that e.g. 3 units of the
  // same service with "Additional detergent" and 2 units without it show as two separate
  // "Services Ordered" rows in the booking summary, instead of one merged 5-unit row.
  const addOnByKey = Object.fromEntries(SERVICE_ADD_ON_OPTIONS.map((option) => [option.key, option]));
  const groupedServiceLineItemsMap = new Map();
  summarySource.forEach((line, index) => {
    const lineKey = String(line.cart_line_id || line.item_id || index);
    const selectedAddOnKeys = SERVICE_ADD_ON_OPTIONS
      .map((option) => option.key)
      .filter((key) => Boolean(serviceLineAddOns?.[lineKey]?.[key]));
    const title = String(line.variantName || line.name || `Service ${index + 1}`).trim();
    const variant = String(line.service_detail?.service_area_type || line.serviceAreaLabel || line.variantName || '').trim();
    const quantity = Math.max(1, Number(line.quantity || 1));
    const lineAmount = (Number(line.price || 0) || 0) * quantity;
    const groupKey = `${title}__${selectedAddOnKeys.slice().sort().join(',')}`;
    const existingGroup = groupedServiceLineItemsMap.get(groupKey);
    if (existingGroup) {
      existingGroup.quantity += quantity;
      existingGroup.amountValue += lineAmount;
    } else {
      groupedServiceLineItemsMap.set(groupKey, {
        key: groupKey,
        title,
        variant,
        quantity,
        amountValue: lineAmount,
        addOns: selectedAddOnKeys.map((key) => addOnByKey[key]),
      });
    }
  });
  const groupedServiceLineItems = Array.from(groupedServiceLineItemsMap.values()).map((group) => ({
    key: group.key,
    title: group.title,
    variant: group.variant,
    quantity: String(group.quantity),
    addOns: group.addOns,
    amount: money(group.amountValue),
  }));

  return {
    bookingSummaryAmount,
    bookingSummaryQuantity,
    groupedServiceLineItems,
    reviewServiceLines,
    serviceBookingSummaryLineItems,
    serviceBookingSummaryRows,
    serviceBookingSummarySchedule,
    serviceBookingSummaryTitle
  };
};
