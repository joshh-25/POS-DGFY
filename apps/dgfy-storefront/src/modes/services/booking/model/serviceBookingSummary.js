import { formatServiceAppointmentSummary } from './serviceBookingSchedule.js';
import { getServicesFlowPresentation } from './servicesLocalFlow.js';
import { resolveStorefrontImageSources } from '../../../../shared/utils/storefrontImageSources.js';

const defaultMoney = (value) => String(value);

const selectedOptionsForLine = (line) => (
  (Array.isArray(line?.selected_options) ? line.selected_options : [])
    .filter((option) => option?.option_id && option?.name)
);

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
          .map((line) => String(line?.service_schedule_at || '').trim())
          .filter(Boolean)
          .map((scheduleAt) => formatServiceAppointmentSummary(scheduleAt))
      ));
      if (uniqueSchedules.length === 1) return uniqueSchedules[0];
      if (uniqueSchedules.length > 1) return 'Varies by service';
      return formatServiceAppointmentSummary(serviceAppointmentAt);
    })()
    : formatServiceAppointmentSummary(serviceAppointmentAt);
  const reviewServiceLines = safeCartLines.map((line, index) => {
    const selectedOptions = selectedOptionsForLine(line);
    return {
      key: String(line.cart_line_id || line.item_id || index),
      title: line.variantName || line.name || `Service ${index + 1}`,
      editFieldKey: 'preferred_date',
      selectedOptions,
      rows: [
        { label: 'Service', value: line.variantName || line.name || 'Service', fieldKey: 'preferred_date' },
        { label: 'Preferred Schedule', value: formatServiceAppointmentSummary(line.service_schedule_at || serviceAppointmentAt), fieldKey: 'preferred_date' },
        ...(line.service_detail?.service_area_type || line.serviceAreaLabel
          ? [{ label: 'Service Variant', value: line.service_detail?.service_area_type || line.serviceAreaLabel, fieldKey: 'unit_type' }]
          : []),
        ...(selectedOptions.length > 0
          ? [{ label: 'Selected Options', value: selectedOptions.map((option) => option.name).join(', '), fieldKey: 'service_options' }]
          : []),
        { label: 'Number of Units', value: String(Math.max(1, Number(line.quantity || 1))), fieldKey: 'unit_count' },
        { label: 'Additional Instructions', value: String(line.service_notes || '').trim() || 'No additional instructions.', fieldKey: 'service_notes' },
      ],
    };
  });
  const serviceBookingSummaryRows = [
    { label: 'Services', value: serviceBookingSummaryTitle },
    { label: 'Schedule', value: serviceBookingSummarySchedule },
    { label: 'Fulfillment type', value: getServicesFlowPresentation(serviceOrderMethod).label },
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
        selected_options: []
      }]
      : []);
  const serviceBookingSummaryLineItems = summarySource.map((line, index) => {
    const lineDuration = String(line.durationLabel || activeBookingService?.durationLabel || '').trim();
    const variationLabel = selectedOptionsForLine(line)
      .filter((option) => option.group_type === 'variation')
      .map((option) => option.name)
      .join(', ');
    const variant = variationLabel || String(line.service_detail?.service_area_type || line.serviceAreaLabel || line.variantName || '').trim();
    return {
      key: String(line.cart_line_id || line.item_id || index),
      title: String(line.variantName || line.name || `Service ${index + 1}`).trim(),
      variant,
      schedule: formatServiceAppointmentSummary(line.service_schedule_at || serviceAppointmentAt),
      quantity: String(Math.max(1, Number(line.quantity || 1))),
      duration: lineDuration,
      notes: String(line.service_notes || '').trim(),
      imageSources: resolveStorefrontImageSources(line, { preferred: 'thumbnail' }),
      amount: money((Number(line.price || 0) || 0) * Math.max(1, Number(line.quantity || 1))),
    };
  });

  // Group lines by service and the exact database-backed option selection. This keeps
  // differently priced variants separate without introducing storefront-only values.
  const groupedServiceLineItemsMap = new Map();
  summarySource.forEach((line, index) => {
    const selectedOptions = selectedOptionsForLine(line);
    const selectedOptionIds = selectedOptions
      .map((option) => Number(option.option_id))
      .sort((left, right) => left - right);
    const title = String(line.variantName || line.name || `Service ${index + 1}`).trim();
    const variationLabel = selectedOptions
      .filter((option) => option.group_type === 'variation')
      .map((option) => option.name)
      .join(', ');
    const variant = variationLabel || String(line.service_detail?.service_area_type || line.serviceAreaLabel || line.variantName || '').trim();
    const quantity = Math.max(1, Number(line.quantity || 1));
    const lineAmount = (Number(line.price || 0) || 0) * quantity;
    const groupKey = `${title}__${selectedOptionIds.join(',')}`;
    const existingGroup = groupedServiceLineItemsMap.get(groupKey);
    if (existingGroup) {
      existingGroup.quantity += quantity;
      existingGroup.amountValue += lineAmount;
    } else {
      groupedServiceLineItemsMap.set(groupKey, {
        key: groupKey,
        title,
        variant,
        imageSources: resolveStorefrontImageSources(line, { preferred: 'thumbnail' }),
        quantity,
        amountValue: lineAmount,
        addOns: selectedOptions
          .filter((option) => option.group_type === 'addon')
          .map((option) => ({
            key: String(option.option_id),
            label: option.name,
            amount: money((Number(option.price_adjustment_centavos || 0) || 0) / 100)
          })),
      });
    }
  });
  const groupedServiceLineItems = Array.from(groupedServiceLineItemsMap.values()).map((group) => ({
    key: group.key,
    title: group.title,
    variant: group.variant,
    imageSources: group.imageSources,
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
