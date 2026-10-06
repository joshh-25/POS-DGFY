/* @vitest-environment jsdom */
import fs from 'node:fs';
import path from 'node:path';
import React, { useState } from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../services/geocodingService.js', async (importOriginal) => ({
  ...(await importOriginal()),
  searchDeliveryAddresses: vi.fn()
}));

import { searchDeliveryAddresses } from '../services/geocodingService.js';
import {
  buildSearchSelectedPin,
  getSearchSelectedPinAddress,
  resolveAddressSearchBias
} from '../features/locations/utils/pinnedDeliveryAddress.js';
import { SimpleCheckoutFulfillmentStep } from '../modes/simple/checkout/components/SimpleCheckoutFulfillmentStep.jsx';
import { useSimpleCheckoutRouteProps } from '../modes/simple/checkout/hooks/useSimpleCheckoutRouteProps.js';
import { useFnbCheckoutRouteProps } from '../modes/fnb/checkout/hooks/useFnbCheckoutRouteProps.js';

const readSource = (relativePath) => fs.readFileSync(path.resolve(__dirname, '..', relativePath), 'utf8');

const JARO_PLAZA = { addressLine: 'Jaro Plaza, Jaro, Iloilo City', latitude: 10.72461234, longitude: 122.55851234, precision: 'street' };

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('#759 address-search helpers shared by every checkout', () => {
  it('buildSearchSelectedPin rounds to 6 decimals and carries the chosen address line', () => {
    const pin = buildSearchSelectedPin(JARO_PLAZA);
    expect(pin).toEqual({ latitude: 10.724612, longitude: 122.558512, address_line: 'Jaro Plaza, Jaro, Iloilo City' });
    expect(getSearchSelectedPinAddress(pin)).toBe('Jaro Plaza, Jaro, Iloilo City');
  });

  it('resolveAddressSearchBias prefers the fulfilling branch, then the customer pin', () => {
    const branch = { latitude: '10.7202', longitude: '122.5621' };
    const pin = { latitude: 10.69, longitude: 122.52 };
    expect(resolveAddressSearchBias(branch, pin)).toEqual({ latitude: 10.7202, longitude: 122.5621 });
    expect(resolveAddressSearchBias({ latitude: null, longitude: null }, pin)).toEqual(pin);
    expect(resolveAddressSearchBias(null, null)).toBeNull();
  });
});

function SimpleStepHarness(props) {
  const [customerAddress, setCustomerAddress] = useState('');
  return (
    <SimpleCheckoutFulfillmentStep
      orderMethod="delivery"
      isDeliveryOrder
      canUseGuestCheckoutFlow
      isDgfyCustomerSignedIn
      deliveryLocationDisplayAddress=""
      customerAddress={customerAddress}
      onCustomerAddressChange={setCustomerAddress}
      {...props}
    />
  );
}

describe('#759 Simple checkout address search', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    searchDeliveryAddresses.mockReset();
  });

  it('choosing a suggestion hands it to onSelectSearchResult', async () => {
    searchDeliveryAddresses.mockResolvedValue([JARO_PLAZA]);
    const onSelectSearchResult = vi.fn();
    render(<SimpleStepHarness
      searchBias={{ latitude: 10.7202, longitude: 122.5621 }}
      onSelectSearchResult={onSelectSearchResult}
    />);

    const input = screen.getByRole('combobox', { name: 'Delivery address' });
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: 'Jaro' } });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });

    expect(searchDeliveryAddresses).toHaveBeenCalledWith(expect.objectContaining({
      query: 'Jaro',
      bias: { latitude: 10.7202, longitude: 122.5621 }
    }));
    fireEvent.click(screen.getByRole('option', { name: /Jaro Plaza/ }));
    expect(onSelectSearchResult).toHaveBeenCalledWith(JARO_PLAZA);
  });

  it('shows the resolving placeholder while the pin address is being looked up', () => {
    render(<SimpleCheckoutFulfillmentStep
      orderMethod="delivery"
      isDeliveryOrder
      canUseGuestCheckoutFlow
      isDgfyCustomerSignedIn
      deliveryLocationDisplayAddress=""
      resolvingPinnedDeliveryAddress
    />);
    expect(screen.getByLabelText('Delivery address').placeholder).toBe('Finding the address for your pin…');
  });

  it('the route props drop a search-selected pin and bias the search to the fulfilling branch', () => {
    const setters = {
      setCustomerPin: vi.fn(),
      setDeliveryLocationAction: vi.fn(),
      setPinLocationError: vi.fn(),
      setSelectedSavedLocationId: vi.fn()
    };
    const props = useSimpleCheckoutRouteProps({
      ...setters,
      resolvingPinnedDeliveryAddress: true,
      storeLocations: [{ location_id: 7, is_primary_storefront: true, latitude: 10.7202, longitude: 122.5621 }],
      selectedLocationId: 7
    });

    expect(props.addressSearchBias).toEqual({ latitude: 10.7202, longitude: 122.5621 });
    expect(props.resolvingPinnedDeliveryAddress).toBe(true);

    props.onSelectSearchResult(JARO_PLAZA);
    expect(setters.setDeliveryLocationAction).toHaveBeenCalledWith('map');
    expect(setters.setSelectedSavedLocationId).toHaveBeenCalledWith('');
    expect(setters.setPinLocationError).toHaveBeenCalledWith('');
    expect(setters.setCustomerPin).toHaveBeenCalledWith(buildSearchSelectedPin(JARO_PLAZA));
  });
});

describe('#759 F&B checkout address search', () => {
  it('passes the search bias through to the F&B checkout', () => {
    const bias = { latitude: 10.7202, longitude: 122.5621 };
    expect(useFnbCheckoutRouteProps({ addressSearchBias: bias }).addressSearchBias).toBe(bias);
  });

  it('renders the shared search field and drops a search-selected pin', () => {
    // FnbCheckoutRouteContainer needs the full storefront runtime to mount, so this pins its wiring
    // at the source level; the field's own behaviour is covered by deliveryAddressSearchField.test.jsx.
    const container = readSource('modes/fnb/checkout/pages/FnbCheckoutRouteContainer.jsx');
    expect(container).toContain('<DeliveryAddressSearchField');
    expect(container).toContain('bias={addressSearchBias}');
    expect(container).toContain('setCustomerPin(buildSearchSelectedPin(result))');
    expect(container).not.toContain('Pinned delivery address will appear here.');
  });
});
