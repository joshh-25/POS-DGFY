import { useEffect, useMemo } from 'react';
import { buildPinnedDeliveryAddress, getSearchSelectedPinAddress, resolveDeliveryAddress } from '../../features/locations/utils/pinnedDeliveryAddress.js';
import { reverseGeocodeDeliveryCoordinates } from '../../services/geocodingService.js';
import { trimAddressCountrySuffix } from '../model/storefrontCatalogModel.js';

/**
 * Moved verbatim from `StorefrontApp.jsx`: `handlePinMyLocation`, the
 * reverse-geocode effect that resolves a dropped pin into a display
 * address, and the `activeServiceLocationSummary` derivation. All three
 * depend on `hasPinnedDeliveryLocation`/`deliveryLocationDisplayAddress`
 * from `useSignedInCheckoutAddresses()`, so this hook's call site must stay
 * at or after that hook's call site in the shell (same as before the move).
 */
export function useDeliveryPinResolution({
  customerAddress,
  customerPin,
  deliveryLocationDisplayAddress,
  hasPinnedDeliveryLocation,
  isDeliveryOrder,
  isCustomerLocationFlow = false,
  resolvedDeliveryAddress,
  setCustomerAddress,
  setCustomerPin,
  setDeliveryLocationAction,
  setPinLocationError,
  setPinLocationLoading,
  setResolvedDeliveryAddress,
  setResolvingPinnedDeliveryAddress,
  setSelectedSavedLocationId
}) {
  const locationResolutionEnabled = isDeliveryOrder || isCustomerLocationFlow;
  const handlePinMyLocation = () => {
    if (!navigator?.geolocation) {
      setPinLocationError('Geolocation is not supported on this device/browser.');
      return;
    }
    setDeliveryLocationAction('current');
    setSelectedSavedLocationId('');
    setPinLocationError('');
    setPinLocationLoading(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setCustomerPin({
          latitude: Number(position.coords.latitude.toFixed(6)),
          longitude: Number(position.coords.longitude.toFixed(6))
        });
        setPinLocationLoading(false);
      },
      (error) => {
        const errorCode = Number(error?.code || 0);
        if (errorCode === 1) {
          setPinLocationError('Location permission is blocked. Pin your location on the map instead.');
        } else if (errorCode === 3) {
          setPinLocationError('Location request timed out. Pin your location on the map instead.');
        } else {
          setPinLocationError('Unable to get your current location.');
        }
        setPinLocationLoading(false);
      },
      {
        enableHighAccuracy: true,
        timeout: 10000
      }
    );
  };

  const activeServiceLocationSummary = useMemo(() => (
    trimAddressCountrySuffix(
      deliveryLocationDisplayAddress
      || resolveDeliveryAddress({ customerAddress, resolvedDeliveryAddress, customerPin })
    )
  ), [customerAddress, customerPin, deliveryLocationDisplayAddress, resolvedDeliveryAddress]);

  useEffect(() => {
    if (!locationResolutionEnabled || !hasPinnedDeliveryLocation) {
      setResolvingPinnedDeliveryAddress(false);
      if (!locationResolutionEnabled) {
        setResolvedDeliveryAddress('');
      }
      return;
    }
    const searchSelectedAddress = getSearchSelectedPinAddress(customerPin);
    if (searchSelectedAddress) {
      setResolvingPinnedDeliveryAddress(false);
      setPinLocationError('');
      setResolvedDeliveryAddress(searchSelectedAddress);
      setCustomerAddress(searchSelectedAddress);
      return;
    }
    const controller = new AbortController();
    const fallbackAddress = buildPinnedDeliveryAddress(customerPin);
    const resolveAddress = async () => {
      setResolvingPinnedDeliveryAddress(true);
      setPinLocationError('');
      try {
        const addressLine = await reverseGeocodeDeliveryCoordinates({
          latitude: customerPin.latitude,
          longitude: customerPin.longitude,
          signal: controller.signal
        });
        if (addressLine) {
          setResolvedDeliveryAddress(addressLine);
          setCustomerAddress(addressLine);
        } else {
          setResolvedDeliveryAddress('');
          setCustomerAddress(fallbackAddress);
        }
      } catch (error) {
        if (error?.name === 'AbortError' || controller.signal.aborted) return;
        setResolvedDeliveryAddress('');
        setCustomerAddress(fallbackAddress);
      } finally {
        if (!controller.signal.aborted) setResolvingPinnedDeliveryAddress(false);
      }
    };
    resolveAddress();
    return () => controller.abort();
  }, [customerPin, hasPinnedDeliveryLocation, isDeliveryOrder, isCustomerLocationFlow, locationResolutionEnabled]);

  return {
    activeServiceLocationSummary,
    handlePinMyLocation
  };
}
