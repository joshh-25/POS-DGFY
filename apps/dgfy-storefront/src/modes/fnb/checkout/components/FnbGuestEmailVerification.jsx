import { GuestEmailVerification } from '../../../../shared/components/checkout/GuestEmailVerification.jsx';

export function FnbGuestEmailVerification(props) {
  return <GuestEmailVerification {...props} badgeLabel="Recommended" resendLabel="Send code again" />;
}
