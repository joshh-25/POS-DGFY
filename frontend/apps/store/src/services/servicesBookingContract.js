import { normalizeStorefrontErrorMessage } from '../storefrontErrorMessages.js';

export const SERVICES_MULTI_LINE_RUNTIME_MESSAGE =
  'Multiple services in one submitted booking are not available yet. Please complete one service booking at a time.';

export const SERVICES_MULTI_UNIT_RUNTIME_MESSAGE =
  'Multiple units in one submitted booking are not available yet. Set the quantity to 1 and submit separate bookings.';

const getLineQuantity = (line) => Math.max(1, Number(line?.quantity || 1));

const buildServiceNotes = ({ line, bookingFieldPlan, customerAddress }) => (
  [
    !bookingFieldPlan?.addressField && String(customerAddress || '').trim()
      ? `Service address: ${String(customerAddress || '').trim()}`
      : '',
    String(line?.service_notes || '').trim()
  ].filter(Boolean).join('\n')
);

export const collectServicesRuntimeCompatibilityIssues = (serviceCartLines = []) => {
  if (!Array.isArray(serviceCartLines) || serviceCartLines.length === 0) return [];

  const issues = [];
  if (serviceCartLines.length > 1) {
    issues.push({
      field: 'Services selected',
      message: SERVICES_MULTI_LINE_RUNTIME_MESSAGE
    });
  }

  serviceCartLines.forEach((line) => {
    if (getLineQuantity(line) <= 1) return;
    const lineName = line?.variantName || line?.name || 'Service';
    issues.push({
      cart_line_id: line?.cart_line_id || '',
      item_id: line?.item_id,
      field: 'Number of Units',
      message: `${lineName}: ${SERVICES_MULTI_UNIT_RUNTIME_MESSAGE}`
    });
  });

  return issues;
};

export const buildSingleServiceBookingPayload = ({
  line,
  customerName,
  customerEmail,
  customerPhone,
  selectedLocationId,
  storeLocationId,
  paymentTiming,
  serviceIntakeResponses,
  bookingPageIntakeFields,
  customerAddress,
  bookingFieldPlan,
  createIdempotencyKey,
}) => ({
  service_item_id: Number(line.item_id),
  start_at: new Date(line.service_schedule_at).toISOString(),
  customer_name: customerName,
  customer_email: customerEmail,
  customer_phone: customerPhone,
  location_id: selectedLocationId ?? storeLocationId,
  payment_timing: paymentTiming,
  intake_responses: bookingPageIntakeFields.length > 0 ? serviceIntakeResponses : null,
  idempotency_key: createIdempotencyKey('store-service'),
  notes: buildServiceNotes({
    line,
    bookingFieldPlan,
    customerAddress
  })
});

export const resolveServicesBookingSubmitContract = ({
  hasServiceCart,
  serviceCartLines,
  serviceBookingLine,
  customerName,
  customerEmail,
  customerPhone,
  selectedLocationId,
  storeLocationId,
  paymentTiming,
  serviceIntakeResponses,
  bookingPageIntakeFields,
  customerAddress,
  bookingFieldPlan,
  createIdempotencyKey,
}) => {
  const runtimeIssues = collectServicesRuntimeCompatibilityIssues(serviceCartLines);
  if (runtimeIssues.length > 0) {
    return {
      compatible: false,
      message: runtimeIssues[0].message,
      issues: runtimeIssues
    };
  }

  const line = hasServiceCart ? serviceCartLines[0] : serviceBookingLine;
  if (!line) {
    return {
      compatible: false,
      message: 'Select a service booking before continuing.',
      issues: []
    };
  }

  if (getLineQuantity(line) > 1) {
    return {
      compatible: false,
      message: SERVICES_MULTI_UNIT_RUNTIME_MESSAGE,
      issues: []
    };
  }

  return {
    compatible: true,
    route: '/api/v1/store/services/bookings',
    body: buildSingleServiceBookingPayload({
      line,
      customerName,
      customerEmail,
      customerPhone,
      selectedLocationId,
      storeLocationId,
      paymentTiming,
      serviceIntakeResponses,
      bookingPageIntakeFields,
      customerAddress,
      bookingFieldPlan,
      createIdempotencyKey,
    }),
    line
  };
};

export const formatServicesBookingFailureMessage = (error, serviceCartLines = []) => {
  const normalized = normalizeStorefrontErrorMessage(error, 'Unable to create service booking.');
  return Array.isArray(serviceCartLines) && serviceCartLines.length > 0
    ? `${normalized} No service booking was submitted.`
    : normalized;
};
