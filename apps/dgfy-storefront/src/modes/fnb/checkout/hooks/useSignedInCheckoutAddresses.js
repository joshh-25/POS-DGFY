import { useCallback, useEffect, useMemo } from 'react';
import {
  extractSavedLocationLabel,
  hasExplicitDeliveryAddressEdit,
  resolveDeliveryAddress
} from '../../../../features/locations/utils/pinnedDeliveryAddress.js';
import { writeGuestDeliveryAddress } from '../../../../shared/model/storefrontGuestDeliveryAddressStorage.js';
import {
  buildCheckoutLocationFromAccountAddress,
  FNB_RECOMMENDED_LOCATION,
  mapAccountAddressToCheckoutLocation
} from '../model/fnbCheckoutAddressLocations.js';

export function useSignedInCheckoutAddresses({
  accountAddresses,
  authToken,
  customerAddress,
  customerPin,
  deliveryLocationAction,
  isDeliveryOrder,
  isFnbMode,
  isSignedIn,
  landmarkNote,
  refreshAccountAddresses,
  requestJson,
  resolvedDeliveryAddress,
  savedPinnedLocations,
  selectedSavedLocationId,
  setCustomerAddress,
  setCustomerPin,
  setDeliveryLocationAction,
  setPinLocationError,
  setResolvedDeliveryAddress,
  setSavedPinnedLocations,
  setSelectedSavedLocationId,
  toast,
  trimAddressCountrySuffix,
  normalizeErrorMessage
}) {
  const accountSavedDeliveryLocations = useMemo(() => {
    if (!isSignedIn || !Array.isArray(accountAddresses)) return [];
    return accountAddresses
      .map((address) => mapAccountAddressToCheckoutLocation(address, trimAddressCountrySuffix))
      .filter(Boolean);
  }, [accountAddresses, isSignedIn, trimAddressCountrySuffix]);

  const deliverySavedLocations = useMemo(() => ([
    ...(accountSavedDeliveryLocations.length > 0 ? accountSavedDeliveryLocations : [FNB_RECOMMENDED_LOCATION]),
    ...savedPinnedLocations
  ]), [accountSavedDeliveryLocations, savedPinnedLocations]);

  const defaultAccountDeliveryLocation = useMemo(() => (
    accountSavedDeliveryLocations.find((location) => location.isDefault) || accountSavedDeliveryLocations[0] || null
  ), [accountSavedDeliveryLocations]);

  const activePinnedDeliveryAddress = resolveDeliveryAddress({ customerAddress, resolvedDeliveryAddress, customerPin });

  const activeSavedLocation = useMemo(() => (
    deliverySavedLocations.find((location) => (
      String(location.id) === String(selectedSavedLocationId)
    )) || null
  ), [deliverySavedLocations, selectedSavedLocationId]);

  const deliveryLocationDisplayAddress = useMemo(() => {
    if (deliveryLocationAction === 'saved'
        && activeSavedLocation?.fullAddress
        && !hasExplicitDeliveryAddressEdit(customerAddress, activeSavedLocation.fullAddress)) {
      return trimAddressCountrySuffix(activeSavedLocation.fullAddress);
    }
    return activePinnedDeliveryAddress ? trimAddressCountrySuffix(activePinnedDeliveryAddress) : '';
  }, [activePinnedDeliveryAddress, activeSavedLocation, customerAddress, deliveryLocationAction, trimAddressCountrySuffix]);

  const hasPinnedDeliveryLocation = Number.isFinite(Number(customerPin?.latitude))
    && Number.isFinite(Number(customerPin?.longitude));

  const canAddPinnedLocation = isDeliveryOrder
    && hasPinnedDeliveryLocation
    && activePinnedDeliveryAddress.length > 0
    && !deliverySavedLocations.some((location) => (
      Number(location.latitude).toFixed(6) === Number(customerPin?.latitude).toFixed(6)
      && Number(location.longitude).toFixed(6) === Number(customerPin?.longitude).toFixed(6)
    ));

  const applySavedDeliveryLocation = useCallback((location) => {
    if (!location) return;
    setDeliveryLocationAction('saved');
    setSelectedSavedLocationId(String(location.id));
    setPinLocationError('');
    setResolvedDeliveryAddress(String(location.fullAddress || ''));
    setCustomerAddress(String(location.fullAddress || ''));

    if (Number.isFinite(Number(location.latitude)) && Number.isFinite(Number(location.longitude))) {
      setCustomerPin({
        latitude: Number(Number(location.latitude).toFixed(6)),
        longitude: Number(Number(location.longitude).toFixed(6))
      });
      return;
    }
    setCustomerPin(null);
  }, [setCustomerAddress, setCustomerPin, setDeliveryLocationAction, setPinLocationError, setResolvedDeliveryAddress, setSelectedSavedLocationId]);

  const refreshDgfyCheckoutAddresses = useCallback(async () => {
    if (!isSignedIn) return [];
    return refreshAccountAddresses();
  }, [isSignedIn, refreshAccountAddresses]);

  const clearActiveDeliveryLocation = useCallback(() => {
    setSelectedSavedLocationId('');
    setResolvedDeliveryAddress('');
    setCustomerAddress('');
    setCustomerPin(null);
    setDeliveryLocationAction('map');
    setPinLocationError('');
  }, [setCustomerAddress, setCustomerPin, setDeliveryLocationAction, setPinLocationError, setResolvedDeliveryAddress, setSelectedSavedLocationId]);

  const handleAddPinnedLocation = useCallback(async () => {
    if (!canAddPinnedLocation || !hasPinnedDeliveryLocation) return;

    const baseLocation = {
      label: String(landmarkNote || '').trim() || extractSavedLocationLabel(activePinnedDeliveryAddress),
      landmarkNote: String(landmarkNote || '').trim(),
      fullAddress: activePinnedDeliveryAddress,
      latitude: Number(Number(customerPin.latitude).toFixed(6)),
      longitude: Number(Number(customerPin.longitude).toFixed(6)),
      recommended: false
    };

    if (isSignedIn) {
      try {
        const created = await requestJson('/api/v1/dgfy/customer/addresses', {
          method: 'POST',
          authToken,
          body: {
            label: baseLocation.label,
            address_line: baseLocation.fullAddress,
            latitude: baseLocation.latitude,
            longitude: baseLocation.longitude,
            is_default: accountSavedDeliveryLocations.length === 0
          }
        });
        await refreshDgfyCheckoutAddresses();
        const nextAddressId = created?.address?.address_id || created?.address_id || null;
        if (nextAddressId) setSelectedSavedLocationId(`account-address-${nextAddressId}`);
        setDeliveryLocationAction('saved');
        toast.success('Address saved to your account.');
      } catch (error) {
        toast.error(normalizeErrorMessage(error, 'Unable to save address.'));
      }
      return;
    }

    const newLocation = { id: `saved-location-${Date.now()}`, source: 'local', ...baseLocation };
    setSavedPinnedLocations((previous) => [...previous, newLocation]);
    setSelectedSavedLocationId(newLocation.id);
    setDeliveryLocationAction('saved');
    writeGuestDeliveryAddress({
      addressLine: baseLocation.fullAddress,
      latitude: baseLocation.latitude,
      longitude: baseLocation.longitude
    });
    toast.success('Saved location added.');
  }, [accountSavedDeliveryLocations.length, activePinnedDeliveryAddress, authToken, canAddPinnedLocation, customerPin, hasPinnedDeliveryLocation, isSignedIn, landmarkNote, normalizeErrorMessage, refreshDgfyCheckoutAddresses, requestJson, setDeliveryLocationAction, setSavedPinnedLocations, setSelectedSavedLocationId, toast]);

  const handleSetDefaultDeliveryAddress = useCallback(async (location) => {
    if (!location?.addressId) return;
    try {
      await requestJson(`/api/v1/dgfy/customer/addresses/${encodeURIComponent(location.addressId)}/default`, {
        method: 'PATCH',
        authToken
      });
      await refreshDgfyCheckoutAddresses();
      applySavedDeliveryLocation({ ...location, isDefault: true });
      toast.success('Default address updated.');
    } catch (error) {
      toast.error(normalizeErrorMessage(error, 'Unable to update default address.'));
    }
  }, [applySavedDeliveryLocation, authToken, normalizeErrorMessage, refreshDgfyCheckoutAddresses, requestJson, toast]);

  const canUpdateSavedAddress = deliveryLocationAction === 'saved'
    && Boolean(activeSavedLocation?.addressId)
    && hasExplicitDeliveryAddressEdit(customerAddress, activeSavedLocation?.fullAddress);

  const handleUpdateSavedAddress = useCallback(async () => {
    if (!activeSavedLocation?.addressId) return;
    if (!hasExplicitDeliveryAddressEdit(customerAddress, activeSavedLocation.fullAddress)) return;
    try {
      await requestJson(`/api/v1/dgfy/customer/addresses/${encodeURIComponent(activeSavedLocation.addressId)}`, {
        method: 'PATCH',
        authToken,
        body: { address_line: String(customerAddress || '').trim() }
      });
      await refreshDgfyCheckoutAddresses();
      toast.success('Address updated.');
    } catch (error) {
      toast.error(normalizeErrorMessage(error, 'Unable to update address.'));
    }
  }, [activeSavedLocation, authToken, customerAddress, normalizeErrorMessage, refreshDgfyCheckoutAddresses, requestJson, toast]);

  const handleRemoveDeliveryAddress = useCallback(async (location) => {
    if (!location) return;
    if (location.source === 'account' && location.addressId) {
      try {
        await requestJson(`/api/v1/dgfy/customer/addresses/${encodeURIComponent(location.addressId)}`, {
          method: 'DELETE',
          authToken
        });
        const nextAddresses = await refreshDgfyCheckoutAddresses();
        if (String(selectedSavedLocationId) === String(location.id)) {
          const defaultAddress = nextAddresses.find((entry) => entry?.is_default) || nextAddresses[0] || null;
          const nextLocation = buildCheckoutLocationFromAccountAddress(defaultAddress, trimAddressCountrySuffix);
          if (nextLocation) applySavedDeliveryLocation(nextLocation);
          else clearActiveDeliveryLocation();
        }
        toast.success('Address removed.');
      } catch (error) {
        toast.error(normalizeErrorMessage(error, 'Unable to remove address.'));
      }
      return;
    }

    setSavedPinnedLocations((previous) => previous.filter((entry) => String(entry.id) !== String(location.id)));
    if (String(selectedSavedLocationId) === String(location.id)) clearActiveDeliveryLocation();
    toast.success('Saved location removed.');
  }, [applySavedDeliveryLocation, authToken, clearActiveDeliveryLocation, normalizeErrorMessage, refreshDgfyCheckoutAddresses, requestJson, selectedSavedLocationId, setSavedPinnedLocations, toast, trimAddressCountrySuffix]);

  useEffect(() => {
    if (!isDeliveryOrder) return;
    if (isSignedIn && defaultAccountDeliveryLocation) {
      if (deliveryLocationAction === 'map' || deliveryLocationAction === 'current') return;
      if (String(customerAddress || '').trim()) return;
      applySavedDeliveryLocation(defaultAccountDeliveryLocation);
      return;
    }
    if (!isFnbMode) return;
    if (deliveryLocationAction === 'map' || deliveryLocationAction === 'current') return;
    if (hasPinnedDeliveryLocation || String(customerAddress || '').trim()) return;
    applySavedDeliveryLocation(FNB_RECOMMENDED_LOCATION);
  }, [applySavedDeliveryLocation, customerAddress, defaultAccountDeliveryLocation, deliveryLocationAction, hasPinnedDeliveryLocation, isDeliveryOrder, isFnbMode, isSignedIn]);

  return {
    accountSavedDeliveryLocations,
    activePinnedDeliveryAddress,
    activeSavedLocation,
    applySavedDeliveryLocation,
    canAddPinnedLocation,
    canUpdateSavedAddress,
    clearActiveDeliveryLocation,
    defaultAccountDeliveryLocation,
    deliveryLocationDisplayAddress,
    deliverySavedLocations,
    handleAddPinnedLocation,
    handleRemoveDeliveryAddress,
    handleSetDefaultDeliveryAddress,
    handleUpdateSavedAddress,
    hasPinnedDeliveryLocation,
    refreshDgfyCheckoutAddresses
  };
}
