/* @vitest-environment jsdom */
import fs from 'node:fs';
import path from 'node:path';
import React, { useState } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  applyDeliveryAddressFieldChange,
  resolveDeliveryAddress
} from '../features/locations/utils/pinnedDeliveryAddress.js';
import { trimAddressCountrySuffix } from '../shared/model/storefrontCatalogModel.js';
import { RetailOrderFulfillmentStep } from '../modes/retail/checkout/components/RetailOrderFulfillmentStep.jsx';
import { SimpleCheckoutFulfillmentStep } from '../modes/simple/checkout/components/SimpleCheckoutFulfillmentStep.jsx';

afterEach(cleanup);

const readSource = (relativePath) => fs.readFileSync(path.resolve(__dirname, '..', relativePath), 'utf8');

const MANDURRIAO = 'Diversion Road, Mandurriao, Iloilo City';

describe('applyDeliveryAddressFieldChange -- emptying the field drops the pin it came from', () => {
  it('only updates the text while something is typed', () => {
    const setCustomerAddress = vi.fn();
    const clearDeliveryLocation = vi.fn();
    applyDeliveryAddressFieldChange('Jaro Pla', { setCustomerAddress, clearDeliveryLocation });
    expect(setCustomerAddress).toHaveBeenCalledWith('Jaro Pla');
    expect(clearDeliveryLocation).not.toHaveBeenCalled();
  });

  it('also clears the delivery location when the field becomes empty or blank', () => {
    for (const emptied of ['', '   ']) {
      const setCustomerAddress = vi.fn();
      const clearDeliveryLocation = vi.fn();
      applyDeliveryAddressFieldChange(emptied, { setCustomerAddress, clearDeliveryLocation });
      expect(setCustomerAddress).toHaveBeenCalledWith(emptied);
      expect(clearDeliveryLocation).toHaveBeenCalledTimes(1);
    }
  });
});

// A pin whose looked-up address is Mandurriao, with the field showing it -- the state a customer is
// in after "Use Current Location", a map tap, or a remembered guest address. Before the fix, an
// emptied field fell back to the pin's address and refilled with Mandurriao straight away.
function PinnedStep({ Step, extraProps = {} }) {
  const [customerAddress, setCustomerAddress] = useState(MANDURRIAO);
  const [customerPin, setCustomerPin] = useState({ latitude: 10.7202, longitude: 122.5432 });
  const [resolvedDeliveryAddress, setResolvedDeliveryAddress] = useState(MANDURRIAO);
  const active = resolveDeliveryAddress({ customerAddress, resolvedDeliveryAddress, customerPin });
  return (
    <Step
      orderMethod="delivery"
      customerAddress={customerAddress}
      customerPin={customerPin}
      deliveryLocationAction="map"
      deliveryLocationDisplayAddress={active ? trimAddressCountrySuffix(active) : ''}
      onCustomerAddressChange={(value) => applyDeliveryAddressFieldChange(value, {
        setCustomerAddress,
        clearDeliveryLocation: () => {
          setResolvedDeliveryAddress('');
          setCustomerPin(null);
        }
      })}
      {...extraProps}
    />
  );
}

describe.each([
  ['RetailOrderFulfillmentStep', RetailOrderFulfillmentStep, {}],
  ['SimpleCheckoutFulfillmentStep', SimpleCheckoutFulfillmentStep, { isDeliveryOrder: true, canUseGuestCheckoutFlow: true, isDgfyCustomerSignedIn: true }]
])('%s: an emptied delivery-address field stays empty', (_name, Step, extraProps) => {
  it('erasing the text does not refill it with the pin\'s address', () => {
    render(<PinnedStep Step={Step} extraProps={extraProps} />);
    const input = screen.getByRole('combobox', { name: 'Delivery address' });
    expect(input.value).toBe(MANDURRIAO);

    fireEvent.change(input, { target: { value: '' } });
    expect(input.value).toBe('');
  });

  it('the clear (×) button empties it too', () => {
    render(<PinnedStep Step={Step} extraProps={extraProps} />);
    fireEvent.click(screen.getByRole('button', { name: 'Clear delivery address' }));
    expect(screen.getByRole('combobox', { name: 'Delivery address' }).value).toBe('');
  });
});

describe('every checkout routes its delivery-address field through the clearing rule', () => {
  it.each([
    ['F&B', 'modes/fnb/checkout/pages/FnbCheckoutRouteContainer.jsx'],
    ['Simple', 'modes/simple/checkout/hooks/useSimpleCheckoutRouteProps.js'],
    ['Retail', 'modes/retail/checkout/pages/RetailOrderPage.jsx']
  ])('%s uses applyDeliveryAddressFieldChange with its own pin reset', (_name, file) => {
    const source = readSource(file);
    expect(source).toMatch(/applyDeliveryAddressFieldChange\(\s*value,\s*\{[^}]*clearDeliveryLocation:/);
  });
});
