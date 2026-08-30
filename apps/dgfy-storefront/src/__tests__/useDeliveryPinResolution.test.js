/* @vitest-environment jsdom */
import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useDeliveryPinResolution } from '../shared/hooks/useDeliveryPinResolution.js';

const baseProps = () => ({
  customerAddress: '',
  customerPin: null,
  deliveryLocationDisplayAddress: '',
  hasPinnedDeliveryLocation: false,
  isDeliveryOrder: false,
  resolvedDeliveryAddress: '',
  setCustomerAddress: vi.fn(),
  setCustomerPin: vi.fn(),
  setDeliveryLocationAction: vi.fn(),
  setPinLocationError: vi.fn(),
  setPinLocationLoading: vi.fn(),
  setResolvedDeliveryAddress: vi.fn(),
  setResolvingPinnedDeliveryAddress: vi.fn(),
  setSelectedSavedLocationId: vi.fn()
});

describe('useDeliveryPinResolution (#1219)', () => {
  it('activeServiceLocationSummary keeps deliveryLocationDisplayAddress as its leading term (J3, no regression to 3-term)', () => {
    const { result } = renderHook(() => useDeliveryPinResolution({
      ...baseProps(),
      deliveryLocationDisplayAddress: 'Saved: Mandurriao Branch',
      customerAddress: 'Blue gate beside the sari-sari store, Purok 3',
      resolvedDeliveryAddress: 'Diversion Road, Mandurriao, Iloilo City'
    }));
    // The leading term wins even though the edit-preferring resolver would pick a different value.
    expect(result.current.activeServiceLocationSummary).toBe('Saved: Mandurriao Branch');
  });

  it('falls through to the edit-preferring resolver when deliveryLocationDisplayAddress is empty', () => {
    const { result } = renderHook(() => useDeliveryPinResolution({
      ...baseProps(),
      deliveryLocationDisplayAddress: '',
      customerAddress: 'Blue gate beside the sari-sari store, Purok 3',
      resolvedDeliveryAddress: 'Diversion Road, Mandurriao, Iloilo City'
    }));
    expect(result.current.activeServiceLocationSummary).toBe('Blue gate beside the sari-sari store, Purok 3');
  });
});
