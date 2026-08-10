export const STOREFRONT_CLOSED_TITLE = 'This storefront is currently closed.';
export const STOREFRONT_CLOSED_BODY_FALLBACK = 'Orders are unavailable right now. Please come back during business hours.';

export const getStorefrontClosedBody = (hoursLabel = '') => (
  hoursLabel
    ? `Orders are unavailable right now. Come back during business hours: ${hoursLabel}.`
    : STOREFRONT_CLOSED_BODY_FALLBACK
);

export const getStorefrontClosedToastMessage = (hoursLabel = '') => (
  hoursLabel
    ? `This storefront is currently closed. Come back during business hours: ${hoursLabel}.`
    : 'This storefront is currently closed. Please come back during business hours.'
);
