import { formatServiceAppointmentSummary, SERVICE_BOOKING_NOT_SELECTED_LABEL } from './serviceBookingSchedule.js';
import { getServicesFlowPresentation } from './servicesLocalFlow.js';
import { resolveStorefrontImageSources } from '../../../../shared/utils/storefrontImageSources.js';
import { formatServiceNumber } from '../../servicesFormatters.js';

const defaultMoney = (value) => String(value);

const selectedOptionsForLine = (line) => (
  (Array.isArray(line?.selected_options) ? line.selected_options : [])
    .filter((option) => option?.option_id && option?.name)
);

const hasConfiguredAddOns = (line) => (
  (Array.isArray(line?.service_option_groups) ? line.service_option_groups : [])
    .some((group) => (
      group?.group_type === 'addon'
      && Array.isArray(group.options)
      && group.options.some((option) => option?.option_id && option?.name)
    ))
);

const SERVICE_AREA_ENUMS = new Set(['customer_location', 'in_store', 'hybrid', 'online']);

const getUserFacingServiceVariant = (line, selectedOptions = []) => {
  const variationLabel = selectedOptions
    .filter((option) => option.group_type === 'variation')
    .map((option) => option.name)
    .join(', ')
    .trim();
  if (variationLabel) return variationLabel;

  const explicitLabel = String(line?.variantName || line?.serviceAreaLabel || '').trim();
  return SERVICE_AREA_ENUMS.has(explicitLabel.toLowerCase()) ? '' : explicitLabel;
};

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
  serviceOrderMethod = '',
  serviceFlowMethod = '',
  serviceFlowProfileMethod = ''
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
      ? `${formatServiceNumber(safeCartLines.length)} Services`
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
  const normalizedOrderMethod = String(serviceOrderMethod || '').trim().toLowerCase();
  const normalizedFlowMethod = String(serviceFlowMethod || '').trim().toLowerCase();
  const normalizedProfileMethod = String(serviceFlowProfileMethod || '').trim().toLowerCase();
  const isOnSiteFlow = [normalizedOrderMethod, normalizedFlowMethod, normalizedProfileMethod].includes('on_site');
  const fulfillmentSummaryValue = isOnSiteFlow
    ? getServicesFlowPresentation('on_site').label
    : (String(serviceOrderMethod || '').trim() ? getServicesFlowPresentation(serviceOrderMethod).label : SERVICE_BOOKING_NOT_SELECTED_LABEL);
  const reviewServiceLines = safeCartLines.map((line, index) => {
    const selectedOptions = selectedOptionsForLine(line);
    const selectedAddOns = selectedOptions.filter((option) => option.group_type === 'addon');
    return {
      key: String(line.cart_line_id || line.item_id || index),
      title: line.variantName || line.name || `Service ${index + 1}`,
      editFieldKey: 'preferred_date',
      selectedOptions,
      serviceOptionGroups: Array.isArray(line.service_option_groups) ? line.service_option_groups : [],
      hasAvailableAddOns: selectedAddOns.length > 0 || hasConfiguredAddOns(line),
      rows: [
        { label: 'Service', value: line.variantName || line.name || 'Service', fieldKey: 'preferred_date' },
        { label: 'Preferred Schedule', value: formatServiceAppointmentSummary(line.service_schedule_at || serviceAppointmentAt), fieldKey: 'preferred_date' },
        ...(getUserFacingServiceVariant(line, selectedOptions)
          ? [{ label: 'Service Variant', value: getUserFacingServiceVariant(line, selectedOptions), fieldKey: 'unit_type' }]
          : []),
        ...(selectedOptions.length > 0
          ? [{ label: 'Selected Options', value: selectedOptions.map((option) => option.name).join(', '), fieldKey: 'service_options' }]
          : []),
        { label: 'Number of Units', value: formatServiceNumber(Math.max(1, Number(line.quantity || 1))), fieldKey: 'unit_count' },
        { label: 'Additional Instructions', value: String(line.service_notes || '').trim() || 'No additional instructions.', fieldKey: 'service_notes' },
      ],
    };
  });
  const serviceBookingSummaryRows = [
    { label: 'Services', value: serviceBookingSummaryTitle },
    { label: 'Schedule', value: serviceBookingSummarySchedule },
    { label: 'Fulfillment type', value: fulfillmentSummaryValue },
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
        selected_options: Array.isArray(activeBookingService.selected_options) ? activeBookingService.selected_options : [],
        service_option_groups: Array.isArray(activeBookingService.service_option_groups) ? activeBookingService.service_option_groups : []
      }]
      : []);
  const serviceBookingSummaryLineItems = summarySource.map((line, index) => {
    const lineDuration = String(line.durationLabel || activeBookingService?.durationLabel || '').trim();
    const variant = getUserFacingServiceVariant(line, selectedOptionsForLine(line));
    return {
      key: String(line.cart_line_id || line.item_id || index),
      itemId: Number(line.item_id) || null,
      title: String(line.variantName || line.name || `Service ${index + 1}`).trim(),
      variant,
      schedule: formatServiceAppointmentSummary(line.service_schedule_at || serviceAppointmentAt),
      quantity: String(Math.max(1, Number(line.quantity || 1))),
      duration: lineDuration,
      notes: String(line.service_notes || '').trim(),
      imageSources: resolveStorefrontImageSources(line, { preferred: 'thumbnail' }),
      selectedOptions: selectedOptionsForLine(line),
      serviceOptionGroups: Array.isArray(line.service_option_groups) ? line.service_option_groups : [],
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
    const variant = getUserFacingServiceVariant(line, selectedOptions);
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
