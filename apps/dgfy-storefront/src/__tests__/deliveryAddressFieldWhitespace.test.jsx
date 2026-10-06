/* @vitest-environment jsdom */
import fs from 'node:fs';
import path from 'node:path';
import React, { useState } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import {
  resolveDeliveryAddress,
  resolveDeliveryAddressInputValue
} from '../features/locations/utils/pinnedDeliveryAddress.js';
import { trimAddressCountrySuffix } from '../shared/model/storefrontCatalogModel.js';
import { RetailOrderFulfillmentStep } from '../modes/retail/checkout/components/RetailOrderFulfillmentStep.jsx';
import { SimpleCheckoutFulfillmentStep } from '../modes/simple/checkout/components/SimpleCheckoutFulfillmentStep.jsx';

afterEach(cleanup);

const readSource = (relativePath) => fs.readFileSync(path.resolve(__dirname, '..', relativePath), 'utf8');

// The display address is derived from the customer's own typed text (useSignedInCheckoutAddresses:
// trimAddressCountrySuffix(resolveDeliveryAddress(...))), which trims it. Feeding that back into the
// controlled input used to swallow every trailing space as it was typed ("Jaro Plaza" -> "JaroPlaza").
const deriveDisplayAddress = (customerAddress) => {
  const active = resolveDeliveryAddress({ customerAddress, resolvedDeliveryAddress: '', customerPin: null });
  return active ? trimAddressCountrySuffix(active) : '';
};

function StatefulStep({ Step, extraProps = {} }) {
  const [customerAddress, setCustomerAddress] = useState('');
  return (
    <Step
      orderMethod="delivery"
      customerAddress={customerAddress}
      deliveryLocationDisplayAddress={deriveDisplayAddress(customerAddress)}
      onCustomerAddressChange={setCustomerAddress}
      {...extraProps}
    />
  );
}

describe('resolveDeliveryAddressInputValue -- what the delivery-address field shows', () => {
  it('keeps the customer\'s own text verbatim, including a trailing space mid-typing', () => {
    expect(resolveDeliveryAddressInputValue('Jaro ', 'Jaro')).toBe('Jaro ');
    expect(resolveDeliveryAddressInputValue('Jaro Plaza, Jaro, Iloilo City ', 'Jaro Plaza, Jaro, Iloilo City'))
      .toBe('Jaro Plaza, Jaro, Iloilo City ');
  });

  it('keeps an explicit edit that differs from the display address (#1219 unchanged)', () => {
    expect(resolveDeliveryAddressInputValue('Blue gate, Purok 3', 'Diversion Road, Mandurriao')).toBe('Blue gate, Purok 3');
  });

  it('falls back to the display address when nothing was typed', () => {
    expect(resolveDeliveryAddressInputValue('', 'Diversion Road, Mandurriao')).toBe('Diversion Road, Mandurriao');
    expect(resolveDeliveryAddressInputValue('   ', 'Diversion Road, Mandurriao')).toBe('Diversion Road, Mandurriao');
  });

  it('shows the display address instead of the generated pinned-coordinate wording', () => {
    expect(resolveDeliveryAddressInputValue('Pinned map location (10.720000, 122.540000)', 'Saved: Mandurriao Branch'))
      .toBe('Saved: Mandurriao Branch');
  });
});

describe.each([
  ['RetailOrderFulfillmentStep', RetailOrderFulfillmentStep, {}],
  ['SimpleCheckoutFulfillmentStep', SimpleCheckoutFulfillmentStep, { isDeliveryOrder: true, canUseGuestCheckoutFlow: true, isDgfyCustomerSignedIn: true }]
])('%s: spaces can be typed into the delivery-address field', (_name, Step, extraProps) => {
  it('keeps a trailing space so a second word can follow', () => {
    render(<StatefulStep Step={Step} extraProps={extraProps} />);
    const input = screen.getByRole('combobox', { name: 'Delivery address' });

    fireEvent.change(input, { target: { value: 'Jaro' } });
    fireEvent.change(input, { target: { value: 'Jaro ' } });
    expect(input.value).toBe('Jaro ');

    fireEvent.change(input, { target: { value: 'Jaro P' } });
    expect(input.value).toBe('Jaro P');
  });
});

describe('F&B checkout uses the same field-value rule', () => {
  it('FnbCheckoutRouteContainer feeds the field through resolveDeliveryAddressInputValue', () => {
    const source = readSource('modes/fnb/checkout/pages/FnbCheckoutRouteContainer.jsx');
    expect(source).toContain('value={resolveDeliveryAddressInputValue(customerAddress, deliveryLocationDisplayAddress)}');
    expect(source).not.toContain('hasExplicitDeliveryAddressEdit(customerAddress, deliveryLocationDisplayAddress) ? customerAddress');
  });
});
