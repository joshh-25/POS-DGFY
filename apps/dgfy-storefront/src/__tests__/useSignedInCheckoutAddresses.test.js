/* @vitest-environment jsdom */
import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useSignedInCheckoutAddresses } from '../modes/fnb/checkout/hooks/useSignedInCheckoutAddresses.js';

const trimAddressCountrySuffix = (value) => String(value || '').replace(/,\s*Philippines$/i, '');

const baseProps = () => ({
  accountAddresses: [],
  authToken: 'token-1',
  customerAddress: '',
  customerPin: null,
  deliveryLocationAction: 'saved',
  isDeliveryOrder: true,
  isFnbMode: true,
  isSignedIn: true,
  landmarkNote: '',
  refreshAccountAddresses: vi.fn(),
  requestJson: vi.fn(),
  resolvedDeliveryAddress: '',
  savedPinnedLocations: [],
  selectedSavedLocationId: 'account-address-1',
  setCustomerAddress: vi.fn(),
  setCustomerPin: vi.fn(),
  setDeliveryLocationAction: vi.fn(),
  setPinLocationError: vi.fn(),
  setResolvedDeliveryAddress: vi.fn(),
  setSavedPinnedLocations: vi.fn(),
  setSelectedSavedLocationId: vi.fn(),
  toast: { success: vi.fn(), error: vi.fn() },
  trimAddressCountrySuffix,
  normalizeErrorMessage: (error, fallback) => fallback
});

describe('useSignedInCheckoutAddresses (#1219)', () => {
  it('activePinnedDeliveryAddress prefers an explicit customer edit over the geocoded value', () => {
    const { result } = renderHook(() => useSignedInCheckoutAddresses({
      ...baseProps(),
      customerAddress: 'Blue gate beside the sari-sari store, Purok 3',
      resolvedDeliveryAddress: 'Diversion Road, Mandurriao, Iloilo City'
    }));
    expect(result.current.activePinnedDeliveryAddress).toBe('Blue gate beside the sari-sari store, Purok 3');
  });

  it("deliveryLocationDisplayAddress under 'saved' returns the saved text when unedited", () => {
    const savedLocation = { id: 'account-address-1', addressId: 1, fullAddress: 'Diversion Road, Mandurriao, Iloilo City' };
    const { result } = renderHook(() => useSignedInCheckoutAddresses({
      ...baseProps(),
      accountAddresses: [{ address_id: 1, address_line: savedLocation.fullAddress, is_default: true }],
      customerAddress: savedLocation.fullAddress,
      resolvedDeliveryAddress: savedLocation.fullAddress
    }));
    expect(result.current.deliveryLocationDisplayAddress).toBe(savedLocation.fullAddress);
  });

  it("deliveryLocationDisplayAddress under 'saved' returns the edited text once the customer diverges (J4)", () => {
    const { result } = renderHook(() => useSignedInCheckoutAddresses({
      ...baseProps(),
      accountAddresses: [{ address_id: 1, address_line: 'Diversion Road, Mandurriao, Iloilo City', is_default: true }],
      customerAddress: 'Blue gate beside the sari-sari store, Purok 3',
      resolvedDeliveryAddress: 'Diversion Road, Mandurriao, Iloilo City'
    }));
    expect(result.current.deliveryLocationDisplayAddress).toBe('Blue gate beside the sari-sari store, Purok 3');
    expect(result.current.canUpdateSavedAddress).toBe(true);
  });

  it('applySavedDeliveryLocation setting both customerAddress and resolvedDeliveryAddress is never misread as an edit', () => {
    // Mirrors what applySavedDeliveryLocation actually does: both fields are set to the same
    // saved fullAddress, so hasExplicitDeliveryAddressEdit must read this as unedited.
    const { result } = renderHook(() => useSignedInCheckoutAddresses({
      ...baseProps(),
      accountAddresses: [{ address_id: 1, address_line: 'Diversion Road, Mandurriao, Iloilo City', is_default: true }],
      customerAddress: 'Diversion Road, Mandurriao, Iloilo City',
      resolvedDeliveryAddress: 'Diversion Road, Mandurriao, Iloilo City'
    }));
    expect(result.current.canUpdateSavedAddress).toBe(false);
    expect(result.current.deliveryLocationDisplayAddress).toBe('Diversion Road, Mandurriao, Iloilo City');
  });
});
