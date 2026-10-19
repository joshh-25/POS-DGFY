import { useStorefrontStore } from '../../store/useStorefrontStore.js';

/**
 * #2594: useState-compatible access to the delivery address's house/unit details, read straight
 * from the checkout store so each mode's fulfillment step can render the details field without
 * threading the value through every route-props layer. The shell reads the same field through
 * useStorefrontCheckoutState for payload building and step gating.
 */
export function useDeliveryAddressDetails() {
  return [
    useStorefrontStore((state) => state.checkout.deliveryAddressDetails),
    useStorefrontStore((state) => state.checkoutSetDeliveryAddressDetails)
  ];
}
