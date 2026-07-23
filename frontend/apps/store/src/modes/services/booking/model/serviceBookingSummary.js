import { formatServiceAppointmentSummary } from './serviceBookingSchedule.js';

const defaultMoney = (value) => String(value);

export const buildServiceBookingSummaryModel = ({
  activeBookingService,
  bookingPagePaymentOptions = [],
  firstServiceLine,
  hasServiceCart,
  money = defaultMoney,
  serviceAppointmentAt,
  serviceCartLines = [],
  serviceCartTotal = 0,
  serviceDraftQuantity = 1,
  serviceIntakeResponses = {},
  serviceLocationSummaryDraft = '',
  servicePaymentTiming = ''
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
      ? `${safeCartLines.length} services selected`
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
    { label: 'Units', value: String(bookingSummaryQuantity) },
    { label: 'Payment', value: bookingPagePaymentOptions.find((option) => option.value === servicePaymentTiming)?.label || 'Pending' },
  ];
  if (serviceLocationSummaryDraft) {
    serviceBookingSummaryRows.push({ label: 'Location', value: serviceLocationSummaryDraft });
  }

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

  return {
    bookingSummaryAmount,
    bookingSummaryQuantity,
    reviewServiceLines,
    serviceBookingSummaryLineItems,
    serviceBookingSummaryRows,
    serviceBookingSummarySchedule,
    serviceBookingSummaryTitle
  };
};
