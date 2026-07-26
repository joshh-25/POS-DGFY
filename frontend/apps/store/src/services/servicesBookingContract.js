import { normalizeStorefrontErrorMessage } from '../shared/model/storefrontErrorMessages.js';

const getLineQuantity = (line) => Math.max(1, Number(line?.quantity || 1));

const buildServiceNotes = ({ line, bookingFieldPlan, customerAddress }) => (
  [
    !bookingFieldPlan?.addressField && String(customerAddress || '').trim()
      ? `Service address: ${String(customerAddress || '').trim()}`
      : '',
    String(line?.service_notes || '').trim()
  ].filter(Boolean).join('\n')
);

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
  quantity: getLineQuantity(line),
  intake_responses: bookingPageIntakeFields.length > 0 ? serviceIntakeResponses : null,
  idempotency_key: createIdempotencyKey('store-service'),
  notes: buildServiceNotes({
    line,
    bookingFieldPlan,
    customerAddress
  })
});

// One draft per cart line for the batch route. Unlike the single-booking-page
// payload above, each service cart line already carries its own schedule,
// notes, payment timing, and intake responses (captured at add-to-cart time in
// useServiceBookingViewModel.js), so drafts read directly off the line rather
// than shared booking-page form state.
const buildServiceBookingDraft = ({ line, bookingFieldPlan, customerAddress }) => ({
  service_item_id: Number(line.item_id),
  start_at: new Date(line.service_schedule_at).toISOString(),
  quantity: getLineQuantity(line),
  payment_timing: line.payment_timing,
  intake_responses: line?.intake_responses && typeof line.intake_responses === 'object' ? line.intake_responses : null,
  notes: buildServiceNotes({ line, bookingFieldPlan, customerAddress })
});

export const buildServiceBookingBatchPayload = ({
  serviceCartLines,
  customerName,
  customerEmail,
  customerPhone,
  selectedLocationId,
  storeLocationId,
  customerAddress,
  bookingFieldPlan,
  createIdempotencyKey,
}) => ({
  customer_name: customerName,
  customer_email: customerEmail,
  customer_phone: customerPhone,
  location_id: selectedLocationId ?? storeLocationId,
  idempotency_key: createIdempotencyKey('store-service-batch'),
  bookings: serviceCartLines.map((line) => buildServiceBookingDraft({ line, bookingFieldPlan, customerAddress }))
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
  const lines = hasServiceCart ? serviceCartLines : (serviceBookingLine ? [serviceBookingLine] : []);
  if (lines.length === 0) {
    return {
      compatible: false,
      message: 'Select a service booking before continuing.',
      issues: []
    };
  }

  if (lines.length > 1) {
    return {
      compatible: true,
      route: '/api/v1/store/services/bookings/batch',
      body: buildServiceBookingBatchPayload({
        serviceCartLines: lines,
        customerName,
        customerEmail,
        customerPhone,
        selectedLocationId,
        storeLocationId,
        customerAddress,
        bookingFieldPlan,
        createIdempotencyKey,
      }),
      line: lines[0]
    };
  }

  const line = lines[0];
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
