import { getBusinessModePinMeta, normalizeBusinessMode } from './businessModePins.js';

export const ModePresentationRegistry = Object.freeze({
  default: Object.freeze({
    heroEyebrow: 'Customer storefront',
    heroDescription: 'Browse the catalog, check availability, and open the cart whenever you are ready.',
    catalogHeading: 'Store Catalog',
    catalogSubtitle: 'Browse what this business currently offers in its public storefront.',
    catalogSearchPlaceholder: 'Search items in this store catalog...',
    primaryActionLabel: 'Order Now',
    trackHeading: 'Track Order',
    trackDescription: 'Enter a tracking PIN to check the latest status without leaving the sheet.',
    supportsServiceGrouping: false
  }),
  services: Object.freeze({
    heroEyebrow: 'Services storefront',
    heroDescription: 'Book service families, answer intake questions, and keep one ticket for the full appointment journey.',
    catalogHeading: 'Book Services',
    catalogSubtitle: 'Choose a service family, pick a service type, then complete the booking details in the cart.',
    catalogSearchPlaceholder: 'Search laundry or aircon services...',
    primaryActionLabel: 'Book a Service',
    trackHeading: 'Track Booking or Order',
    trackDescription: 'Enter a booking reference or order tracking PIN to check the latest status without leaving the sheet.',
    supportsServiceGrouping: true
  })
});

export const getStorefrontModeAdapter = (store = null) => {
  const mode = normalizeBusinessMode(store?.workflow_mode || store?.ops_workflow_mode);
  const modeConfig = ModePresentationRegistry[mode] || ModePresentationRegistry.default;
  const pin = getBusinessModePinMeta(mode);

  return {
    mode,
    pin,
    ...ModePresentationRegistry.default,
    ...modeConfig,
    isServicesMode: mode === 'services'
  };
};
