// Delivery-pricing units are canonicalized to whole meters by the fee policy. Keep the
// configuration floor at one meter so a valid increment can never become zero during conversion.
export const MIN_DELIVERY_INCREMENT_KM = 0.001;
export const MIN_DELIVERY_INCREMENT_METERS = 1;

export default {
    MIN_DELIVERY_INCREMENT_KM,
    MIN_DELIVERY_INCREMENT_METERS
};
