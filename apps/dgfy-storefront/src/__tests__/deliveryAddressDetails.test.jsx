/* @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { hasDeliveryAddress, isCustomerStepComplete } from '../checkout/checkoutValidation.js';
import { buildSearchSelectedPin, composeDeliveryAddress, getSearchSelectedPinHouseNumber } from '../features/locations/utils/pinnedDeliveryAddress.js';
import { DeliveryAddressDetailsField } from '../shared/components/checkout/DeliveryAddressDetailsField.jsx';

afterEach(cleanup);

describe('composeDeliveryAddress (#2594)', () => {
  it('puts the details before the location', () => {
    expect(composeDeliveryAddress('Blk 5 Lot 12', 'Rizal Street, Jaro, Iloilo City'))
      .toBe('Blk 5 Lot 12, Rizal Street, Jaro, Iloilo City');
  });

  it('trims both parts and never doubles a separator', () => {
    expect(composeDeliveryAddress('  Unit 3B, ', ' , Diversion Road, Mandurriao '))
      .toBe('Unit 3B, Diversion Road, Mandurriao');
  });

  it('returns whichever part exists when the other is empty', () => {
    expect(composeDeliveryAddress('', 'Rizal Street, Jaro')).toBe('Rizal Street, Jaro');
    expect(composeDeliveryAddress('Blk 5', '')).toBe('Blk 5');
    expect(composeDeliveryAddress('', '')).toBe('');
  });

  it('does not prefix a location that already starts with the details', () => {
    expect(composeDeliveryAddress('52', '52, Rizal Street, Jaro')).toBe('52, Rizal Street, Jaro');
    expect(composeDeliveryAddress('52', '52 Rizal Street, Jaro')).toBe('52, 52 Rizal Street, Jaro');
  });
});

describe('search-selected pin house number (#2594)', () => {
  it('carries the resolved house number on the pin', () => {
    const pin = buildSearchSelectedPin({ latitude: 10.72, longitude: 122.56, addressLine: '52 Rizal Street, Jaro', houseNumber: '52' });
    expect(pin).toEqual({ latitude: 10.72, longitude: 122.56, address_line: '52 Rizal Street, Jaro', house_number: '52' });
    expect(getSearchSelectedPinHouseNumber(pin)).toBe('52');
  });

  it('leaves the pin without a house number when the search had none', () => {
    const pin = buildSearchSelectedPin({ latitude: 10.72, longitude: 122.56, addressLine: 'Jaro Plaza', houseNumber: null });
    expect(pin).not.toHaveProperty('house_number');
    expect(getSearchSelectedPinHouseNumber(pin)).toBe('');
  });
});

describe('delivery address validation (#2594)', () => {
  const pinned = { isDeliveryOrder: true, hasPinnedDeliveryLocation: true, activePinnedDeliveryAddress: 'Rizal Street, Jaro', usePinnedAddress: true };

  it('requires house/unit details for a delivery', () => {
    expect(hasDeliveryAddress(pinned)).toBe(false);
    expect(hasDeliveryAddress({ ...pinned, deliveryAddressDetails: '   ' })).toBe(false);
    expect(hasDeliveryAddress({ ...pinned, deliveryAddressDetails: 'Blk 5' })).toBe(true);
  });

  it('still requires the location itself', () => {
    expect(hasDeliveryAddress({ ...pinned, activePinnedDeliveryAddress: '', deliveryAddressDetails: 'Blk 5' })).toBe(false);
  });

  it('does not apply to pickup', () => {
    expect(hasDeliveryAddress({ isDeliveryOrder: false })).toBe(true);
  });

  it('carries through the customer step check', () => {
    const base = { customerName: 'Ana', customerPhone: '+639170000000', isDeliveryOrder: true, customerAddress: 'Rizal Street, Jaro' };
    expect(isCustomerStepComplete(base)).toBe(false);
    expect(isCustomerStepComplete({ ...base, deliveryAddressDetails: 'Unit 3B' })).toBe(true);
  });
});

describe('DeliveryAddressDetailsField (#2594)', () => {
  const renderField = (props = {}) => {
    const onValueChange = vi.fn();
    render(<DeliveryAddressDetailsField value="" onValueChange={onValueChange} locationAddress="Rizal Street, Jaro, Iloilo City" {...props} />);
    return { onValueChange, input: screen.getByLabelText(/House no\., Blk\/Lot, unit or building/) };
  };

  it('is marked required and reports typing', () => {
    const { input, onValueChange } = renderField();
    expect(input.getAttribute('aria-required')).toBe('true');
    expect(screen.getByText('Required')).toBeTruthy();

    fireEvent.change(input, { target: { value: 'Blk 5' } });
    expect(onValueChange).toHaveBeenCalledWith('Blk 5');
  });

  it('shows no error before the customer leaves the field, then one once it is left empty', () => {
    const { input } = renderField();
    expect(screen.queryByRole('alert')).toBeNull();

    fireEvent.blur(input);
    expect(screen.getByRole('alert').textContent).toMatch(/house number or unit/);
    expect(input.getAttribute('aria-invalid')).toBe('true');
  });

  it('shows the error immediately when the caller blocked Continue', () => {
    renderField({ showError: true });
    expect(screen.getByRole('alert')).toBeTruthy();
  });

  it('previews the combined address the rider will see', () => {
    renderField({ value: 'Blk 5 Lot 12' });
    expect(screen.getByTestId('delivery-address-preview').textContent)
      .toBe('Blk 5 Lot 12, Rizal Street, Jaro, Iloilo City');
  });

  it('previews a placeholder for the missing part, and nothing without a location', () => {
    renderField();
    expect(screen.getByTestId('delivery-address-preview').textContent)
      .toBe('your house or unit, Rizal Street, Jaro, Iloilo City');

    cleanup();
    renderField({ locationAddress: '' });
    expect(screen.queryByTestId('delivery-address-preview')).toBeNull();
  });
});
