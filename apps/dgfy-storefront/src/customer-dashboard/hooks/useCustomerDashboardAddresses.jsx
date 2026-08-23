import { useCallback, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';

export function useCustomerDashboardAddresses({ accountPanel, setAccountPanel, handleLoadAccountPanel, dgfySessionAccount, isDgfyCustomerSignedIn, requestJson, readDgfyAuthToken, normalizeCoordinatePair, normalizeStorefrontErrorMessage, setDeliveryLocationAction, setSelectedSavedLocationId, setPinLocationError, setResolvedDeliveryAddress, setCustomerAddress, setCustomerPin, createAddressPinEditorRenderer, DeliveryPinMap, reverseGeocodeDeliveryPin, buildPinnedDeliveryAddress, isMobileViewport }) {
  const [accountAddressActionId, setAccountAddressActionId] = useState('');
  const [pinAction, setPinAction] = useState({ mode: '', loading: false, error: '' });
  const pinRequestRef = useRef(0);
  const useAccountAddressForCheckout = useCallback((address) => {
    if (!address) return;
    const addressLine = String(address.address_line || address.fullAddress || address.formatted_address || '').trim();
    const coordinates = normalizeCoordinatePair(address);
    setDeliveryLocationAction('saved');
    setSelectedSavedLocationId(String(address.id || (address.address_id ? `account-address-${address.address_id}` : 'account-address')));
    setPinLocationError('');
    if (addressLine) { setResolvedDeliveryAddress(addressLine); setCustomerAddress(addressLine); }
    if (coordinates) setCustomerPin(coordinates);
    toast.success('Saved address applied to checkout.');
  }, [normalizeCoordinatePair, setCustomerAddress, setCustomerPin, setDeliveryLocationAction, setPinLocationError, setResolvedDeliveryAddress, setSelectedSavedLocationId]);
  const applyPin = useCallback(async ({ pin, onChange, mode }) => {
    const coordinates = normalizeCoordinatePair(pin);
    if (!coordinates || typeof onChange !== 'function') return;
    const requestId = ++pinRequestRef.current;
    onChange((previous) => ({ ...previous, ...coordinates, address_line: String(previous?.address_line || '').trim() || buildPinnedDeliveryAddress(coordinates) }));
    setPinAction({ mode, loading: true, error: '' });
    try {
      const resolvedAddress = await reverseGeocodeDeliveryPin(coordinates);
      if (pinRequestRef.current !== requestId) return;
      onChange((previous) => ({ ...previous, ...coordinates, address_line: resolvedAddress || buildPinnedDeliveryAddress(coordinates) }));
      setPinAction({ mode: '', loading: false, error: '' });
    } catch {
      if (pinRequestRef.current === requestId) setPinAction({ mode, loading: false, error: 'Address lookup failed. The pin remains selected; edit the address text if needed.' });
    }
  }, [buildPinnedDeliveryAddress, normalizeCoordinatePair, reverseGeocodeDeliveryPin]);
  const useCurrentLocation = useCallback(({ onChange, mode }) => {
    if (!navigator?.geolocation) return setPinAction({ mode, loading: false, error: 'Geolocation is not supported on this device/browser.' });
    setPinAction({ mode, loading: true, error: '' });
    navigator.geolocation.getCurrentPosition(({ coords }) => applyPin({ pin: { latitude: coords.latitude, longitude: coords.longitude }, onChange, mode }), () => setPinAction({ mode, loading: false, error: 'Unable to get your current location. Pin the address on the map instead.' }), { enableHighAccuracy: true, timeout: 10000 });
  }, [applyPin]);
  const renderAddressPinEditor = useMemo(() => createAddressPinEditorRenderer({ DeliveryPinMap, accountAddressPinAction: pinAction, applyAccountAddressPin: applyPin, handleAccountAddressCurrentLocation: useCurrentLocation, isMobileViewport, normalizeCoordinatePair }), [DeliveryPinMap, applyPin, createAddressPinEditorRenderer, isMobileViewport, normalizeCoordinatePair, pinAction, useCurrentLocation]);
  const handleSaveAccountAddress = useCallback(async (draft = {}, existingAddress = null) => {
    const token = readDgfyAuthToken();
    const addressLine = String(draft.address_line || '').trim();
    if (!token && !dgfySessionAccount?.id) { toast.error('Sign in to manage saved addresses.'); return false; }
    if (!addressLine) { toast.error('Enter an address before saving.'); return false; }
    const addressId = existingAddress?.address_id;
    setAccountAddressActionId(addressId ? `save:${addressId}` : 'new');
    try {
      const coordinates = normalizeCoordinatePair(draft);
      await requestJson(addressId ? `/api/v1/dgfy/customer/addresses/${encodeURIComponent(addressId)}` : '/api/v1/dgfy/customer/addresses', { method: addressId ? 'PUT' : 'POST', authToken: token, cache: 'no-store', body: { label: String(draft.label || 'Address').trim() || 'Address', address_line: addressLine, latitude: coordinates?.latitude ?? null, longitude: coordinates?.longitude ?? null, is_default: draft.is_default === true } });
      toast.success(addressId ? 'Address updated.' : 'Address saved.');
      await handleLoadAccountPanel();
      return true;
    } catch (error) { toast.error(normalizeStorefrontErrorMessage(error, 'Unable to save this address.')); return false; } finally { setAccountAddressActionId(''); }
  }, [dgfySessionAccount?.id, handleLoadAccountPanel, normalizeCoordinatePair, normalizeStorefrontErrorMessage, readDgfyAuthToken, requestJson]);
  const handleSetDefaultAccountAddress = useCallback(async (address = {}) => {
    if (!address.address_id) return;
    const targetId = String(address.address_id);
    const previousAddresses = Array.isArray(accountPanel?.addresses) ? accountPanel.addresses : [];
    setAccountPanel((previous) => ({ ...previous, addresses: previousAddresses.map((entry) => ({ ...entry, is_default: String(entry?.address_id || '') === targetId })) }));
    setAccountAddressActionId(`default:${targetId}`);
    try { await requestJson(`/api/v1/dgfy/customer/addresses/${encodeURIComponent(targetId)}/default`, { method: 'PATCH', authToken: readDgfyAuthToken(), cache: 'no-store' }); toast.success(`${String(address.address_line || 'Address').trim()} set as default address.`); await handleLoadAccountPanel(); }
    catch (error) { setAccountPanel((previous) => ({ ...previous, addresses: previousAddresses })); toast.error(normalizeStorefrontErrorMessage(error, 'Unable to update default address.')); }
    finally { setAccountAddressActionId(''); }
  }, [accountPanel?.addresses, handleLoadAccountPanel, normalizeStorefrontErrorMessage, readDgfyAuthToken, requestJson, setAccountPanel]);
  const handleDeleteAccountAddress = useCallback(async (address = {}) => {
    if (!address.address_id) return;
    setAccountAddressActionId(`delete:${address.address_id}`);
    try { await requestJson(`/api/v1/dgfy/customer/addresses/${encodeURIComponent(address.address_id)}`, { method: 'DELETE', authToken: readDgfyAuthToken(), cache: 'no-store' }); toast.success('Address deleted.'); await handleLoadAccountPanel(); }
    finally { setAccountAddressActionId(''); }
  }, [handleLoadAccountPanel, readDgfyAuthToken, requestJson]);
  const refreshAccountAddresses = useCallback(async () => {
    if (!isDgfyCustomerSignedIn) return [];
    const payload = await requestJson('/api/v1/dgfy/customer/addresses', { authToken: readDgfyAuthToken(), cache: 'no-store' });
    const addresses = Array.isArray(payload?.addresses) ? payload.addresses : [];
    setAccountPanel((previous) => ({ ...previous, addresses }));
    return addresses;
  }, [isDgfyCustomerSignedIn, readDgfyAuthToken, requestJson, setAccountPanel]);
  return { accountAddressActionId, useAccountAddressForCheckout, renderAddressPinEditor, handleSaveAccountAddress, handleSetDefaultAccountAddress, handleDeleteAccountAddress, refreshAccountAddresses };
}
