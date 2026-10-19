import { describe, expect, it } from 'vitest';
import {
  FNB_RECOMMENDED_LOCATION,
  mapAccountAddressToCheckoutLocation
} from './fnbCheckoutAddressLocations.js';

describe('fnbCheckoutAddressLocations', () => {
  it('maps a signed-in customer address into the checkout location contract', () => {
    const location = mapAccountAddressToCheckoutLocation({
      address_id: 42,
      label: 'Home',
      address_line: 'Jaro, Iloilo City, Iloilo, Philippines',
      latitude: '10.7201',
      longitude: '122.5621',
      is_default: true
    }, (value) => value.replace(', Philippines', ''));

    expect(location).toEqual({
      id: 'account-address-42',
      addressId: 42,
      source: 'account',
      label: 'Home',
      fullAddress: 'Jaro, Iloilo City, Iloilo',
      addressDetails: '',
      latitude: 10.7201,
      longitude: 122.5621,
      recommended: false,
      isDefault: true
    });
  });

  it('carries saved house/unit details, trimmed (#2594)', () => {
    const location = mapAccountAddressToCheckoutLocation({
      address_id: 43,
      address_line: 'Rizal Street, Jaro, Iloilo City',
      address_details: '  Blk 5 Lot 12 '
    }, (value) => value);

    expect(location.addressDetails).toBe('Blk 5 Lot 12');
  });

  it('keeps the fallback location available when an account has no saved addresses', () => {
    expect(FNB_RECOMMENDED_LOCATION).toMatchObject({
      id: 'recommended-main-branch',
      label: 'Mandurriao, Iloilo City',
      recommended: true
    });
  });
});
