/** @vitest-environment jsdom */
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import MerchantAddressDetailsField from '../MerchantAddressDetailsField.jsx';
import {
  buildMerchantAddressPayload,
  composeMerchantAddress,
  hasMerchantAddressDetails,
  readMerchantAddressParts,
  splitMerchantAddressLocation
} from '../merchantAddressDetails.js';

afterEach(cleanup);

describe('merchant address details helpers (#2595)', () => {
  it('composes the full display address as `<details>, <location>`', () => {
    expect(composeMerchantAddress('118, Ground floor', 'E. Lopez Street, Jaro, Iloilo City'))
      .toBe('118, Ground floor, E. Lopez Street, Jaro, Iloilo City');
    expect(composeMerchantAddress(' Unit 3B, ', ' , Diversion Road ')).toBe('Unit 3B, Diversion Road');
    expect(composeMerchantAddress('', 'Diversion Road')).toBe('Diversion Road');
    expect(composeMerchantAddress('Unit 3B', '')).toBe('Unit 3B');
  });

  it('splits a saved address_line back into its location part', () => {
    expect(splitMerchantAddressLocation('118, Ground floor, E. Lopez Street, Jaro', '118, Ground floor'))
      .toBe('E. Lopez Street, Jaro');
    // A location saved before details existed, or edited so it no longer starts with them, is kept whole.
    expect(splitMerchantAddressLocation('E. Lopez Street, Jaro', '')).toBe('E. Lopez Street, Jaro');
    expect(splitMerchantAddressLocation('E. Lopez Street, Jaro', 'Unit 3B')).toBe('E. Lopez Street, Jaro');
  });

  it('round-trips through save and edit', () => {
    const payload = buildMerchantAddressPayload({ details: ' 118 ', location: 'E. Lopez Street, Jaro' });
    expect(payload).toEqual({ address_line: '118, E. Lopez Street, Jaro', address_details: '118' });
    expect(readMerchantAddressParts(payload)).toEqual({ address_details: '118', address_line: 'E. Lopez Street, Jaro' });
    expect(readMerchantAddressParts({ address_line: 'Oton, Iloilo' })).toEqual({ address_details: '', address_line: 'Oton, Iloilo' });
  });

  it('sends null details when there are none', () => {
    expect(buildMerchantAddressPayload({ details: '  ', location: 'Oton' })).toEqual({ address_line: 'Oton', address_details: null });
    expect(hasMerchantAddressDetails('  ')).toBe(false);
    expect(hasMerchantAddressDetails('118')).toBe(true);
  });
});

describe('MerchantAddressDetailsField (#2595)', () => {
  const renderField = (props = {}) => {
    const onChange = vi.fn();
    render(<MerchantAddressDetailsField value="" onChange={onChange} locationAddress="E. Lopez Street, Jaro" {...props} />);
    return { onChange, input: screen.getByLabelText(/Street no\., unit, floor or building/) };
  };

  it('is required and reports typing', () => {
    const { input, onChange } = renderField();
    expect(input.getAttribute('aria-required')).toBe('true');
    fireEvent.change(input, { target: { value: '118' } });
    expect(onChange).toHaveBeenCalledWith('118');
  });

  it('shows the error after the field is left empty, or when the caller blocked a save', () => {
    const { input } = renderField();
    expect(screen.queryByRole('alert')).toBeNull();
    fireEvent.blur(input);
    expect(screen.getByRole('alert')).toBeTruthy();

    cleanup();
    renderField({ showError: true });
    expect(screen.getByRole('alert')).toBeTruthy();
  });

  it('never shows the error while disabled', () => {
    renderField({ disabled: true, showError: true });
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('previews the full address customers and riders will see', () => {
    renderField({ value: '118, Ground floor' });
    expect(screen.getByTestId('merchant-address-preview').textContent).toBe('118, Ground floor, E. Lopez Street, Jaro');
  });
});
