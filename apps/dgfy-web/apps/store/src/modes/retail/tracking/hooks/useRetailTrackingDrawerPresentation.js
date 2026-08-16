import { useMemo, useState } from 'react';

export function useRetailTrackingDrawerPresentation({
  isGuestStorefrontUser,
  isSignedIn,
  isStandaloneTrackingPage,
  selectedStoreSlug
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [expandedPins, setExpandedPins] = useState([]);

  const canOpen = useMemo(() => (
    !isStandaloneTrackingPage
  ), [isStandaloneTrackingPage]);

  const isEligible = canOpen && (isSignedIn || isGuestStorefrontUser || Boolean(selectedStoreSlug));

  return {
    canOpen,
    expandedPins,
    isOpen: isOpen && isEligible,
    setExpandedPins,
    setIsOpen
  };
}
