import {
  FULFILLMENT_PROFILES,
  resolveFulfillmentProfile
} from '@sieitzz/shared-constants/fulfillmentProfiles';

export const SERVICES_LOCAL_SIMULATION_ENABLED = import.meta.env.DEV === true;

const LOCAL_FLOW_DEFINITIONS = Object.freeze({
  delivery: Object.freeze({
    method: 'delivery',
    profileKey: 'item_pickup_return',
    label: 'Pick up and deliver',
    shortLabel: 'Pickup and return',
    requiresAddress: true,
    requiresSchedule: true,
    requiresPayment: false,
    icon: 'truck'
  }),
  pickup: Object.freeze({
    method: 'pickup',
    profileKey: 'item_pickup_collection',
    label: "Pick up and I'll collect",
    shortLabel: 'Pickup and collection',
    requiresAddress: true,
    requiresSchedule: true,
    requiresPayment: false,
    icon: 'shopping-bag'
  }),
  dropoff: Object.freeze({
    method: 'dropoff',
    profileKey: 'item_dropoff_collection',
    label: 'Drop off and collect',
    shortLabel: 'Drop-off and collection',
    requiresAddress: false,
    requiresSchedule: true,
    requiresPayment: false,
    icon: 'package'
  }),
  quote: Object.freeze({
    method: 'quote',
    profileKey: 'quote_request',
    label: 'Request a quote',
    shortLabel: 'Quote request',
    requiresAddress: false,
    requiresSchedule: false,
    requiresPayment: false,
    icon: 'file-text'
  }),
  appointment: Object.freeze({
    method: 'appointment',
    profileKey: 'appointment_at_business',
    label: 'Appointment at the business',
    shortLabel: 'Appointment',
    requiresAddress: false,
    requiresBranch: true,
    requiresSchedule: true,
    requiresPayment: true,
    icon: 'calendar'
  }),
  on_site: Object.freeze({
    method: 'on_site',
    profileKey: 'service_at_customer_address',
    label: "Service at the customer's address",
    shortLabel: 'Service at your address',
    requiresAddress: true,
    requiresBranch: false,
    requiresSchedule: true,
    requiresPayment: true,
    icon: 'map-pin'
  }),
  online: Object.freeze({
    method: 'online',
    profileKey: 'online_service',
    label: 'Online service',
    shortLabel: 'Online appointment',
    requiresAddress: false,
    requiresBranch: false,
    requiresSchedule: true,
    requiresPayment: true,
    icon: 'calendar'
  }),
  hybrid: Object.freeze({
    method: 'hybrid',
    profileKey: 'customer_choice_of_location',
    label: 'Choose where the service takes place',
    shortLabel: 'Choose a location',
    requiresAddress: false,
    requiresBranch: false,
    requiresLocationChoice: true,
    requiresSchedule: true,
    requiresPayment: true,
    icon: 'map-pin'
  })
});

const LEGACY_FLOW_METHODS = Object.freeze(['delivery', 'pickup']);

const FLOW_PRESENTATION_BY_PROFILE = Object.freeze({
  item_pickup_return: Object.freeze({
    method: 'delivery',
    trackingTitle: 'Pickup and delivery',
    locationTitle: 'Delivery details',
    trackingDescription: 'This local preview follows pickup through service completion and return delivery.'
  }),
  item_pickup_collection: Object.freeze({
    method: 'pickup',
    trackingTitle: 'Pickup and collection',
    locationTitle: 'Pickup at',
    trackingDescription: 'This local preview follows pickup through service completion and store collection.'
  }),
  item_dropoff_collection: Object.freeze({
    method: 'dropoff',
    trackingTitle: 'Drop-off and collection',
    locationTitle: 'Drop-off at',
    trackingDescription: 'This local preview follows the customer drop-off and later collection steps.'
  }),
  quote_request: Object.freeze({
    method: 'quote',
    trackingTitle: 'Quote request',
    locationTitle: 'Request details',
    trackingDescription: 'The business will review the request and prepare a price in this local preview.'
  }),
  appointment_at_business: Object.freeze({
    method: 'appointment',
    trackingTitle: 'Appointment',
    locationTitle: 'Appointment at',
    trackingDescription: 'This booking follows the customer appointment from confirmation through service completion.'
  }),
  service_at_customer_address: Object.freeze({
    method: 'on_site',
    trackingTitle: 'Service visit',
    locationTitle: 'Service address',
    trackingDescription: 'This booking follows the scheduled service visit at the customer address.'
  }),
  online_service: Object.freeze({
    method: 'online',
    trackingTitle: 'Online appointment',
    locationTitle: 'Online service',
    trackingDescription: 'This booking follows the online appointment from confirmation through completion.'
  }),
  customer_choice_of_location: Object.freeze({
    method: 'hybrid',
    trackingTitle: 'Service appointment',
    locationTitle: 'Service location',
    trackingDescription: 'This booking follows the selected service location from confirmation through completion.'
  })
});

export const getServicesLocalFlowDefinition = (method = 'delivery') => (
  LOCAL_FLOW_DEFINITIONS[String(method || '').trim().toLowerCase()] || LOCAL_FLOW_DEFINITIONS.delivery
);

export const getServicesFlowPresentation = (value = 'delivery') => {
  const normalizedValue = String(value || '').trim().toLowerCase();
  const profileKey = FLOW_PRESENTATION_BY_PROFILE[normalizedValue]
    ? normalizedValue
    : getServicesLocalFlowDefinition(normalizedValue).profileKey;
  const definition = getServicesLocalFlowDefinition(FLOW_PRESENTATION_BY_PROFILE[profileKey]?.method || normalizedValue);
  return {
    ...definition,
    ...FLOW_PRESENTATION_BY_PROFILE[profileKey],
    profileKey
  };
};

export const getServicesLocalFlowOptions = ({ includePlanned = SERVICES_LOCAL_SIMULATION_ENABLED } = {}) => (
  Object.values(LOCAL_FLOW_DEFINITIONS).filter((definition) => (
    includePlanned || LEGACY_FLOW_METHODS.includes(definition.method)
  ))
);

export const isServicesLocalFlowMethod = (method = '') => (
  Boolean(LOCAL_FLOW_DEFINITIONS[String(method || '').trim().toLowerCase()])
);

export const isServicesQuoteFlow = (method = '') => (
  getServicesLocalFlowDefinition(method).profileKey === 'quote_request'
);

export const isServicesLocalSimulationMethod = (method = '') => (
  SERVICES_LOCAL_SIMULATION_ENABLED && isServicesLocalFlowMethod(method)
);

export const getServicesFlowProfile = (method = 'delivery') => {
  const definition = getServicesLocalFlowDefinition(method);
  return resolveFulfillmentProfile(definition.profileKey) || FULFILLMENT_PROFILES.appointment_at_business;
};
