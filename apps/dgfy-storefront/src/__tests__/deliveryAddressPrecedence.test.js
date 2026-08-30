import { describe, expect, it } from 'vitest';
import {
  resolveDeliveryAddress,
  hasExplicitDeliveryAddressEdit
} from '../features/locations/utils/pinnedDeliveryAddress.js';

describe('resolveDeliveryAddress (#1219)', () => {
  it('prefers an explicit customer edit over a reverse-geocoded value (#1219)', () => {
    expect(resolveDeliveryAddress({
      resolvedDeliveryAddress: 'Diversion Road, Mandurriao, Iloilo City',
      customerAddress: 'Blue gate beside the sari-sari store, Purok 3',
      customerPin: { latitude: 10.72, longitude: 122.56 }
    })).toBe('Blue gate beside the sari-sari store, Purok 3');
  });

  it('falls back to the geocoded value when customerAddress is empty', () => {
    expect(resolveDeliveryAddress({
      resolvedDeliveryAddress: 'Diversion Road, Mandurriao, Iloilo City',
      customerAddress: '',
      customerPin: { latitude: 10.72, longitude: 122.56 }
    })).toBe('Diversion Road, Mandurriao, Iloilo City');
  });

  it('treats the auto-generated pinned-location string as not an edit', () => {
    expect(resolveDeliveryAddress({
      resolvedDeliveryAddress: 'Diversion Road, Mandurriao, Iloilo City',
      customerAddress: 'Pinned map location (10.720000, 122.560000)',
      customerPin: { latitude: 10.72, longitude: 122.56 }
    })).toBe('Diversion Road, Mandurriao, Iloilo City');
  });

  it('treats a whitespace-only customerAddress as empty', () => {
    expect(resolveDeliveryAddress({
      resolvedDeliveryAddress: 'Diversion Road, Mandurriao, Iloilo City',
      customerAddress: '   ',
      customerPin: { latitude: 10.72, longitude: 122.56 }
    })).toBe('Diversion Road, Mandurriao, Iloilo City');
  });

  it('falls back to the built pinned-location string when both address fields are empty', () => {
    expect(resolveDeliveryAddress({
      resolvedDeliveryAddress: '',
      customerAddress: '',
      customerPin: { latitude: 10.72, longitude: 122.56 }
    })).toBe('Pinned map location (10.720000, 122.560000)');
  });

  it('returns an empty string when everything is empty', () => {
    expect(resolveDeliveryAddress({
      resolvedDeliveryAddress: '',
      customerAddress: '',
      customerPin: null
    })).toBe('');
  });
});

describe('hasExplicitDeliveryAddressEdit (#1219)', () => {
  it('returns false when the text equals the compared value', () => {
    expect(hasExplicitDeliveryAddressEdit('Same text', 'Same text')).toBe(false);
  });

  it('returns false for the generated pinned-location fallback', () => {
    expect(hasExplicitDeliveryAddressEdit(
      'Pinned map location (10.720000, 122.560000)',
      'Diversion Road, Mandurriao, Iloilo City'
    )).toBe(false);
  });

  it('returns true for a genuine divergence', () => {
    expect(hasExplicitDeliveryAddressEdit(
      'Blue gate beside the sari-sari store, Purok 3',
      'Diversion Road, Mandurriao, Iloilo City'
    )).toBe(true);
  });
});
