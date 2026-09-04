import { normalizeStorefrontErrorMessage } from '../shared/model/storefrontErrorMessages.js';
import { resolveServiceBookingScheduleAt } from '../shared/model/serviceBookingScheduleResolver.js';

const getLineQuantity = (line) => Math.max(1, Number(line?.quantity || 1));

const getSelectedServiceOptionIds = (line) => [...new Set([
  ...(Array.isArray(line?.selected_option_ids) ? line.selected_option_ids : []),
  ...(Array.isArray(line?.selected_options) ? line.selected_options.map((option) => option?.option_id) : [])
].map(Number).filter((optionId) => Number.isInteger(optionId) && optionId > 0))];

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
  fallbackScheduleAt,
  createIdempotencyKey,
}) => ({
  service_item_id: Number(line.item_id),
  start_at: new Date(resolveServiceBookingScheduleAt(line, fallbackScheduleAt)).toISOString(),
  customer_name: customerName,
  customer_email: customerEmail,
  customer_phone: customerPhone,
  location_id: selectedLocationId ?? storeLocationId,
  payment_timing: paymentTiming,
  quantity: getLineQuantity(line),
  selected_option_ids: getSelectedServiceOptionIds(line),
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
const buildServiceBookingDraft = ({ line, bookingFieldPlan, customerAddress, fallbackScheduleAt }) => ({
  service_item_id: Number(line.item_id),
  start_at: new Date(resolveServiceBookingScheduleAt(line, fallbackScheduleAt)).toISOString(),
  quantity: getLineQuantity(line),
  payment_timing: line.payment_timing,
  selected_option_ids: getSelectedServiceOptionIds(line),
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
  fallbackScheduleAt,
  createIdempotencyKey,
}) => ({
  customer_name: customerName,
  customer_email: customerEmail,
  customer_phone: customerPhone,
  location_id: selectedLocationId ?? storeLocationId,
  idempotency_key: createIdempotencyKey('store-service-batch'),
  bookings: serviceCartLines.map((line) => buildServiceBookingDraft({
    line,
    bookingFieldPlan,
    customerAddress,
    fallbackScheduleAt
  }))
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
  serviceAppointmentAt,
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
        fallbackScheduleAt: serviceAppointmentAt,
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
      fallbackScheduleAt: serviceAppointmentAt,
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
