import { useEffect, useMemo } from 'react';
import { buildPinnedDeliveryAddress, formatReverseGeocodedAddress, resolveDeliveryAddress } from '../../features/locations/utils/pinnedDeliveryAddress.js';
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
    if (!isDeliveryOrder || !hasPinnedDeliveryLocation) {
      setResolvingPinnedDeliveryAddress(false);
      if (!isDeliveryOrder) {
        setResolvedDeliveryAddress('');
      }
      return;
    }
    const controller = new AbortController();
    const latitude = Number(customerPin.latitude);
    const longitude = Number(customerPin.longitude);
    const fallbackAddress = buildPinnedDeliveryAddress(customerPin);
    const resolveAddress = async () => {
      setResolvingPinnedDeliveryAddress(true);
      setPinLocationError('');
      try {
        const response = await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${encodeURIComponent(latitude)}&lon=${encodeURIComponent(longitude)}&format=jsonv2&addressdetails=1`, {
          method: 'GET',
          signal: controller.signal,
          headers: {
            Accept: 'application/json'
          }
        });
        if (!response.ok) {
          throw new Error(`Reverse geocoding failed: ${response.status}`);
        }
        const payload = await response.json();
        const formattedAddress = formatReverseGeocodedAddress(payload) || fallbackAddress;
        setResolvedDeliveryAddress(formattedAddress);
        setCustomerAddress(formattedAddress);
      } catch (error) {
        if (error?.name === 'AbortError') return;
        setResolvedDeliveryAddress('');
        setCustomerAddress(fallbackAddress);
      } finally {
        setResolvingPinnedDeliveryAddress(false);
      }
    };
    resolveAddress();
    return () => controller.abort();
  }, [customerPin, hasPinnedDeliveryLocation, isDeliveryOrder]);

  return {
    activeServiceLocationSummary,
    handlePinMyLocation
  };
}
