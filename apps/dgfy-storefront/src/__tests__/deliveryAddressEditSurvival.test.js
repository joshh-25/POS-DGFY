/* @vitest-environment jsdom */
import { renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useDeliveryPinResolution } from '../shared/hooks/useDeliveryPinResolution.js';

// #1219, J5: a typed edit must survive every re-render for which the pin did not change; moving
// the pin is an explicit "this is a different place" gesture and legitimately resets the text.
describe('useDeliveryPinResolution reverse-geocode effect -- the J5 contract', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({
      ok: true,
      json: () => Promise.resolve({ address: { road: 'Diversion Road', city: 'Iloilo City' } })
    })));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const buildProps = (overrides = {}) => ({
    customerAddress: '',
    customerPin: { latitude: 10.72, longitude: 122.56 },
    deliveryLocationDisplayAddress: '',
    hasPinnedDeliveryLocation: true,
    isDeliveryOrder: true,
    resolvedDeliveryAddress: '',
    setCustomerAddress: vi.fn(),
    setCustomerPin: vi.fn(),
    setDeliveryLocationAction: vi.fn(),
    setPinLocationError: vi.fn(),
    setPinLocationLoading: vi.fn(),
    setResolvedDeliveryAddress: vi.fn(),
    setResolvingPinnedDeliveryAddress: vi.fn(),
    setSelectedSavedLocationId: vi.fn(),
    ...overrides
  });

  it('fires the geocode effect exactly once for an unchanged pin, even across re-renders', async () => {
    const setCustomerAddress = vi.fn();
    const props = buildProps({ setCustomerAddress });
    const { rerender } = renderHook((p) => useDeliveryPinResolution(p), { initialProps: props });

    await waitFor(() => expect(setCustomerAddress).toHaveBeenCalledTimes(1));

    // A re-render with the same pin (e.g. caused by an unrelated state update elsewhere in the
    // tree, or the customer typing into the now-editable input) must not re-fire the effect --
    // its dependency array keys only on customerPin/hasPinnedDeliveryLocation/isDeliveryOrder.
    rerender({ ...props, customerAddress: 'Blue gate beside the sari-sari store, Purok 3' });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(setCustomerAddress).toHaveBeenCalledTimes(1);
  });

  it('re-fires the geocode effect, replacing the address, when the pin actually moves', async () => {
    const setCustomerAddress = vi.fn();
    const props = buildProps({ setCustomerAddress });
    const { rerender } = renderHook((p) => useDeliveryPinResolution(p), { initialProps: props });

    await waitFor(() => expect(setCustomerAddress).toHaveBeenCalledTimes(1));

    rerender({ ...props, customerPin: { latitude: 10.8, longitude: 122.6 } });
    await waitFor(() => expect(setCustomerAddress).toHaveBeenCalledTimes(2));
  });
});
