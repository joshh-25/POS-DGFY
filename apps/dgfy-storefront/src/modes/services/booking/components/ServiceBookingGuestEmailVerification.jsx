import { GuestEmailVerification } from '../../../../shared/components/checkout/GuestEmailVerification.jsx';

export function ServiceBookingGuestEmailVerification(props) {
  return <GuestEmailVerification {...props} badgeLabel="Required" resendLabel="Send verification code" />;
}
