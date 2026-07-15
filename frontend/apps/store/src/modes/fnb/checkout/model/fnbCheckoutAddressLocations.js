import { DEFAULT_CENTER } from '../../../../app/runtime/storefrontMapRuntime.js';

export const FNB_RECOMMENDED_LOCATION = Object.freeze({
  id: 'recommended-main-branch',
  label: 'Mandurriao, Iloilo City',
  fullAddress: 'Mandurriao, Iloilo City, Iloilo, Philippines',
  latitude: DEFAULT_CENTER.latitude,
  longitude: DEFAULT_CENTER.longitude,
  recommended: true,
  source: 'recommended',
  isDefault: false
});

export function mapAccountAddressToCheckoutLocation(address, trimAddressCountrySuffix) {
  const fullAddress = trimAddressCountrySuffix(address?.address_line);
  if (!fullAddress) return null;

  const latitude = Number(address?.latitude);
  const longitude = Number(address?.longitude);

  return {
    id: `account-address-${address?.address_id || fullAddress}`,
    addressId: address?.address_id || null,
    source: 'account',
    label: String(address?.label || 'Saved address').trim() || 'Saved address',
    fullAddress,
    latitude: Number.isFinite(latitude) ? latitude : null,
    longitude: Number.isFinite(longitude) ? longitude : null,
    recommended: false,
    isDefault: Boolean(address?.is_default)
  };
}

export function buildCheckoutLocationFromAccountAddress(address, trimAddressCountrySuffix) {
  return mapAccountAddressToCheckoutLocation(address, trimAddressCountrySuffix);
}
