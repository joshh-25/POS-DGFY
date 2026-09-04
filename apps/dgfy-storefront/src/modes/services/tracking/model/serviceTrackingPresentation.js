export const SERVICE_TRACKING_FLOW = Object.freeze([
  { id: 'requested', label: 'Request received' },
  { id: 'confirmed', label: 'Booking confirmed' },
  { id: 'checked_in', label: 'Ready for your appointment' },
  { id: 'in_service', label: 'Service in progress' },
  { id: 'completed', label: 'Service completed' }
]);

const LOCAL_TRACKING_FLOWS = Object.freeze({
  item_pickup_return: Object.freeze([
    { id: 'requested', label: 'Request received' },
    { id: 'for_pickup', label: 'Scheduled for pickup' },
    { id: 'pickup_completed', label: 'Item picked up' },
    { id: 'in_service', label: 'Service in progress' },
    { id: 'out_for_return', label: 'Out for return' },
    { id: 'completed', label: 'Completed' }
  ]),
  item_pickup_collection: Object.freeze([
    { id: 'requested', label: 'Request received' },
    { id: 'for_pickup', label: 'Scheduled for pickup' },
    { id: 'pickup_completed', label: 'Item picked up' },
    { id: 'in_service', label: 'Service in progress' },
    { id: 'ready_for_collection', label: 'Ready for collection' },
    { id: 'completed', label: 'Collected' }
  ]),
  item_dropoff_collection: Object.freeze([
    { id: 'requested', label: 'Request received' },
    { id: 'for_dropoff', label: 'Ready for drop-off' },
    { id: 'dropoff_completed', label: 'Drop-off received' },
    { id: 'in_service', label: 'Service in progress' },
    { id: 'ready_for_collection', label: 'Ready for collection' },
    { id: 'collected', label: 'Collected' },
    { id: 'completed', label: 'Completed' }
  ]),
  quote_request: Object.freeze([
    { id: 'requested', label: 'Quote request received' },
    { id: 'quoted', label: 'Quote prepared' },
    { id: 'accepted', label: 'Quote accepted' },
    { id: 'completed', label: 'Request completed' }
  ]),
  service_at_customer_address: Object.freeze([
    { id: 'requested', label: 'Request received' },
    { id: 'confirmed', label: 'Booking confirmed' },
    { id: 'checked_in', label: 'Ready for your service visit' },
    { id: 'in_service', label: 'Service in progress' },
    { id: 'completed', label: 'Service completed' }
  ])
});

const SERVICE_STATUS_COPY = Object.freeze({
  requested: {
    label: 'Service request received',
    guidance: 'Your request has been sent to the service team for confirmation.'
  },
  confirmed: {
    label: 'Booking confirmed',
    guidance: 'Your appointment is confirmed. Please keep this reference for follow-up.'
  },
  checked_in: {
    label: 'Ready for your appointment',
    guidance: 'The service team has recorded your arrival and is ready for the appointment.'
  },
  in_service: {
    label: 'Service in progress',
    guidance: 'The service team is currently working on your booking.'
  },
  completed: {
    label: 'Service completed',
    guidance: 'This service booking has been completed.'
  },
  cancelled: {
    label: 'Booking cancelled',
    guidance: 'This service booking was cancelled. Contact the storefront if you need help.'
  },
  no_show: {
    label: 'Marked as no-show',
    guidance: 'This booking was marked as no-show. Contact the storefront if you need help.'
  }
});

const LOCAL_STATUS_COPY = Object.freeze({
  for_pickup: { label: 'Scheduled for pickup', guidance: 'This local preview is waiting for the pickup handoff.' },
  pickup_completed: { label: 'Item picked up', guidance: 'This local preview has recorded the pickup handoff.' },
  out_for_return: { label: 'Out for return', guidance: 'This local preview has moved to the return leg.' },
  for_dropoff: { label: 'Ready for drop-off', guidance: 'Bring the item to the selected branch to begin this local preview.' },
  dropoff_completed: { label: 'Drop-off received', guidance: 'This local preview has recorded the branch drop-off.' },
  ready_for_collection: { label: 'Ready for collection', guidance: 'This local preview is ready for the customer collection step.' },
  collected: { label: 'Collected', guidance: 'This local preview has recorded the collection handoff.' },
  quoted: { label: 'Quote prepared', guidance: 'This local preview has a quote ready for customer review.' },
  accepted: { label: 'Quote accepted', guidance: 'This local preview has recorded acceptance of the quote.' }
});

export const normalizeServiceTrackingStatus = (value) => {
  const status = String(value || '').trim().toLowerCase();
  return SERVICE_STATUS_COPY[status] || LOCAL_STATUS_COPY[status] ? status : '';
};

export const getServiceTrackingStatusCopy = (status) => (
  SERVICE_STATUS_COPY[normalizeServiceTrackingStatus(status)] || LOCAL_STATUS_COPY[normalizeServiceTrackingStatus(status)] || {
    label: 'Service booking update',
    guidance: 'The storefront has a new update for this service booking.'
  }
);

export const getServiceTrackingFlow = (profileKey = '') => (
  LOCAL_TRACKING_FLOWS[String(profileKey || '').trim()] || SERVICE_TRACKING_FLOW
);

export const getServiceTrackingStatusCopyForProfile = (status, profileKey = '') => {
  const normalizedStatus = normalizeServiceTrackingStatus(status);
  const flow = getServiceTrackingFlow(profileKey);
  const step = flow.find((entry) => entry.id === normalizedStatus);
  if (step && LOCAL_TRACKING_FLOWS[String(profileKey || '').trim()]) {
    return {
      label: step.label,
      guidance: LOCAL_STATUS_COPY[normalizedStatus]?.guidance || `${step.label} in this local preview.`
    };
  }
  return getServiceTrackingStatusCopy(normalizedStatus);
};

export const buildServiceTrackingTimeline = (status, profileKey = '') => {
  const normalizedStatus = normalizeServiceTrackingStatus(status);
  const flow = getServiceTrackingFlow(profileKey);
  const activeIndex = flow.findIndex((step) => step.id === normalizedStatus);
  return flow.map((step, index) => ({
    ...step,
    state: activeIndex < 0
      ? 'pending'
      : index < activeIndex
        ? 'done'
        : index === activeIndex
          ? 'active'
          : 'pending'
  }));
};

export const getServiceTrackingActiveStepIndex = (status, profileKey = '') => (
  getServiceTrackingFlow(profileKey).findIndex((step) => step.id === normalizeServiceTrackingStatus(status))
);
