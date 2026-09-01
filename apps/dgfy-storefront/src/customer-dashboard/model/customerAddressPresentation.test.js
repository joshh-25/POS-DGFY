import { describe, expect, it } from 'vitest';
import {
  createCustomerAddressDraft,
  getCustomerAddressNote,
  getCustomerAddressTitle,
  isCustomerAddressDefault
} from './customerAddressPresentation.js';

describe('customer address presentation', () => {
  it('shows the saved label before the address line and preserves it for editing', () => {
    const address = {
      address_id: 10,
      label: 'Home',
      address_line: 'Ibarra Street, Aurora Subdivision, City Proper'
    };

    expect(getCustomerAddressTitle(address)).toBe('Home');
    expect(getCustomerAddressNote(address)).toBe('Home');
    expect(createCustomerAddressDraft(address, { keepDefaultFlag: true })).toEqual({
      address_id: 10,
      label: 'Home',
      address_line: 'Ibarra Street, Aurora Subdivision, City Proper',
      latitude: null,
      longitude: null,
      is_default: false
    });
  });

  it('falls back to a readable address title when the API label is generic', () => {
    expect(getCustomerAddressTitle({ label: 'Address', address_line: 'Oton, Iloilo' })).toBe('Oton, Iloilo');
    expect(getCustomerAddressNote({ label: 'Address', address_line: 'Oton, Iloilo' })).toBe('');
  });

  it('recognizes boolean-shaped default values returned by local API/database drivers', () => {
    expect(isCustomerAddressDefault({ is_default: true })).toBe(true);
    expect(isCustomerAddressDefault({ is_default: 1 })).toBe(true);
    expect(isCustomerAddressDefault({ is_default: '1' })).toBe(true);
    expect(isCustomerAddressDefault({ is_default: 'false' })).toBe(false);
    expect(isCustomerAddressDefault({ is_default: 0 })).toBe(false);
  });
});
