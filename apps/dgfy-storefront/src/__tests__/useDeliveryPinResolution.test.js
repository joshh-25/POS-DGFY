/* @vitest-environment jsdom */
import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { reverseGeocodeDeliveryCoordinates } from '../services/geocodingService.js';
import { useDeliveryPinResolution } from '../shared/hooks/useDeliveryPinResolution.js';

vi.mock('../services/geocodingService.js', () => ({ reverseGeocodeDeliveryCoordinates: vi.fn() }));

beforeEach(() => {
  reverseGeocodeDeliveryCoordinates.mockReset();
});

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

describe('useDeliveryPinResolution -- pin-to-address lookup (#506, #759)', () => {
  const pinnedProps = (customerPin) => ({
    ...baseProps(),
    isDeliveryOrder: true,
    hasPinnedDeliveryLocation: true,
    customerPin
  });

  it('reverse-geocodes a map pin through dgfy-api and fills the address field with the result', async () => {
    reverseGeocodeDeliveryCoordinates.mockResolvedValue('Diversion Road, Mandurriao, Iloilo City');
    const props = pinnedProps({ latitude: 10.72, longitude: 122.54 });
    renderHook(() => useDeliveryPinResolution(props));

    await waitFor(() => expect(props.setCustomerAddress).toHaveBeenCalledWith('Diversion Road, Mandurriao, Iloilo City'));
    expect(reverseGeocodeDeliveryCoordinates).toHaveBeenCalledWith(expect.objectContaining({ latitude: 10.72, longitude: 122.54 }));
    expect(props.setResolvedDeliveryAddress).toHaveBeenCalledWith('Diversion Road, Mandurriao, Iloilo City');
    expect(props.setResolvingPinnedDeliveryAddress).toHaveBeenLastCalledWith(false);
  });

  it('uses a chosen search suggestion as-is, with no reverse-geocode round trip', () => {
    const props = pinnedProps({ latitude: 10.7246, longitude: 122.5585, address_line: 'Jaro Plaza, Jaro, Iloilo City' });
    renderHook(() => useDeliveryPinResolution(props));

    expect(reverseGeocodeDeliveryCoordinates).not.toHaveBeenCalled();
    expect(props.setCustomerAddress).toHaveBeenCalledWith('Jaro Plaza, Jaro, Iloilo City');
    expect(props.setResolvedDeliveryAddress).toHaveBeenCalledWith('Jaro Plaza, Jaro, Iloilo City');
  });

  it('falls back to the pinned-coordinate wording when the lookup has no address', async () => {
    reverseGeocodeDeliveryCoordinates.mockResolvedValue('');
    const props = pinnedProps({ latitude: 10.72, longitude: 122.54 });
    renderHook(() => useDeliveryPinResolution(props));

    await waitFor(() => expect(props.setCustomerAddress).toHaveBeenCalledWith('Pinned map location (10.720000, 122.540000)'));
    expect(props.setResolvedDeliveryAddress).toHaveBeenCalledWith('');
  });

  it('falls back to the pinned-coordinate wording when the lookup fails', async () => {
    reverseGeocodeDeliveryCoordinates.mockRejectedValue(new Error('Request failed before reaching API.'));
    const props = pinnedProps({ latitude: 10.72, longitude: 122.54 });
    renderHook(() => useDeliveryPinResolution(props));

    await waitFor(() => expect(props.setCustomerAddress).toHaveBeenCalledWith('Pinned map location (10.720000, 122.540000)'));
  });
});

describe('useDeliveryPinResolution -- searched house number prefill (#2594)', () => {
  const searchPin = { latitude: 10.7246, longitude: 122.5585, address_line: '52 Rizal Street, Jaro, Iloilo City', house_number: '52' };

  it('prefills empty house/unit details with the house number a search resolved', () => {
    const props = { ...baseProps(), isDeliveryOrder: true, hasPinnedDeliveryLocation: true, customerPin: searchPin, setDeliveryAddressDetails: vi.fn() };
    renderHook(() => useDeliveryPinResolution(props));

    expect(props.setDeliveryAddressDetails).toHaveBeenCalledWith('52');
  });

  it('never overwrites details the customer already typed', () => {
    const props = { ...baseProps(), isDeliveryOrder: true, hasPinnedDeliveryLocation: true, customerPin: searchPin, deliveryAddressDetails: 'Unit 3B', setDeliveryAddressDetails: vi.fn() };
    renderHook(() => useDeliveryPinResolution(props));

    expect(props.setDeliveryAddressDetails).not.toHaveBeenCalled();
  });

  it('does not re-resolve the pin when only the details change', async () => {
    reverseGeocodeDeliveryCoordinates.mockResolvedValue('Diversion Road, Mandurriao, Iloilo City');
    const props = { ...baseProps(), isDeliveryOrder: true, hasPinnedDeliveryLocation: true, customerPin: { latitude: 10.72, longitude: 122.54 } };
    const { rerender } = renderHook((overrides) => useDeliveryPinResolution({ ...props, ...overrides }), { initialProps: {} });
    await waitFor(() => expect(reverseGeocodeDeliveryCoordinates).toHaveBeenCalledTimes(1));

    rerender({ deliveryAddressDetails: 'Blk 5' });
    rerender({ deliveryAddressDetails: 'Blk 5 Lot 12' });

    expect(reverseGeocodeDeliveryCoordinates).toHaveBeenCalledTimes(1);
  });
});
