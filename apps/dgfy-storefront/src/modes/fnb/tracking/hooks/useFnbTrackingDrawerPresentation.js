import { useMemo, useState } from 'react';

export function useFnbTrackingDrawerPresentation({
  isGuestStorefrontUser,
  isSignedIn,
  isStandaloneTrackingPage,
  selectedStoreSlug
}) {
  const [isOpen, setIsOpen] = useState(false);

  const canOpen = useMemo(() => (
    !isStandaloneTrackingPage
  ), [isStandaloneTrackingPage]);

  const isEligible = canOpen && (isSignedIn || isGuestStorefrontUser || Boolean(selectedStoreSlug));

  return {
    canOpen,
    isOpen: isOpen && isEligible,
    setIsOpen
  };
}
