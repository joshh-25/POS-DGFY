import { GuestEmailVerification } from '../../../../shared/components/checkout/GuestEmailVerification.jsx';
import { GUEST_CHECKOUT_FONT_FAMILY } from '../../../../shared/components/checkout/guestCheckoutTypography.js';

export function FnbGuestEmailVerification(props) {
  return <GuestEmailVerification {...props} bodyFont={GUEST_CHECKOUT_FONT_FAMILY} badgeLabel="Recommended" resendLabel="Send code again" />;
}
