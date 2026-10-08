/* @vitest-environment jsdom */
import React, { useState } from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { DeliveryAddressSearchField } from '../shared/components/checkout/DeliveryAddressSearchField.jsx';

const RESULTS = [
  { addressLine: 'Jaro Plaza, Jaro, Iloilo City', latitude: 10.7246, longitude: 122.5585, precision: 'street' },
  { addressLine: 'Jaro Cathedral, Jaro, Iloilo City', latitude: 10.7251, longitude: 122.5573, precision: 'poi' }
];

function Harness({ searchAddresses, onClear = () => {}, onSelectResult = () => {}, initialValue = '' }) {
  const [value, setValue] = useState(initialValue);
  return (
    <DeliveryAddressSearchField
      value={value}
      onValueChange={setValue}
      onClear={() => {
        setValue('');
        onClear();
      }}
      onSelectResult={(result) => {
        setValue(result.addressLine);
        onSelectResult(result);
      }}
      searchAddresses={searchAddresses}
      debounceMs={300}
    />
  );
}

const typeInto = (input, text) => {
  fireEvent.focus(input);
  fireEvent.change(input, { target: { value: text } });
};

const flushSearch = async () => {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(300);
  });
};

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('#759 DeliveryAddressSearchField -- type an address, choose a suggestion, pin the map', () => {
  it('waits for the debounce, then searches with the typed text and lists suggestions', async () => {
    const searchAddresses = vi.fn().mockResolvedValue(RESULTS);
    render(<Harness searchAddresses={searchAddresses} />);
    const input = screen.getByRole('combobox', { name: 'Delivery address' });

    typeInto(input, 'Jaro');
    expect(searchAddresses).not.toHaveBeenCalled();

    await flushSearch();
    expect(searchAddresses).toHaveBeenCalledTimes(1);
    expect(searchAddresses.mock.calls[0][0]).toMatchObject({ query: 'Jaro' });
    expect(screen.getAllByRole('option').map((option) => option.textContent)).toEqual([
      'Jaro Plaza, Jaro, Iloilo City',
      'Jaro Cathedral, Jaro, Iloilo City'
    ]);
    expect(input.getAttribute('aria-expanded')).toBe('true');
  });

  it('does not search below 2 characters', async () => {
    const searchAddresses = vi.fn().mockResolvedValue(RESULTS);
    render(<Harness searchAddresses={searchAddresses} />);

    typeInto(screen.getByRole('combobox', { name: 'Delivery address' }), 'J');
    await flushSearch();

    expect(searchAddresses).not.toHaveBeenCalled();
    expect(screen.queryByRole('option')).toBeNull();
  });

  it('ArrowDown + Enter chooses the highlighted suggestion and closes the list', async () => {
    const onSelectResult = vi.fn();
    render(<Harness searchAddresses={vi.fn().mockResolvedValue(RESULTS)} onSelectResult={onSelectResult} />);
    const input = screen.getByRole('combobox', { name: 'Delivery address' });

    typeInto(input, 'Jaro');
    await flushSearch();
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(onSelectResult).toHaveBeenCalledWith(RESULTS[1]);
    expect(input.value).toBe('Jaro Cathedral, Jaro, Iloilo City');
    expect(screen.queryByRole('option')).toBeNull();
  });

  it('clicking a suggestion chooses it, and the chosen text does not trigger a new search', async () => {
    const searchAddresses = vi.fn().mockResolvedValue(RESULTS);
    const onSelectResult = vi.fn();
    render(<Harness searchAddresses={searchAddresses} onSelectResult={onSelectResult} />);

    typeInto(screen.getByRole('combobox', { name: 'Delivery address' }), 'Jaro');
    await flushSearch();
    fireEvent.click(screen.getByRole('option', { name: 'Jaro Plaza, Jaro, Iloilo City' }));
    await flushSearch();

    expect(onSelectResult).toHaveBeenCalledWith(RESULTS[0]);
    expect(searchAddresses).toHaveBeenCalledTimes(1);
  });

  it('never searches text it did not receive from typing (e.g. an address filled in from the pin)', async () => {
    const searchAddresses = vi.fn().mockResolvedValue(RESULTS);
    render(<Harness searchAddresses={searchAddresses} initialValue="Diversion Road, Mandurriao, Iloilo City" />);

    fireEvent.focus(screen.getByRole('combobox', { name: 'Delivery address' }));
    await flushSearch();

    expect(searchAddresses).not.toHaveBeenCalled();
  });

  it('Escape closes the list without choosing anything', async () => {
    const onSelectResult = vi.fn();
    render(<Harness searchAddresses={vi.fn().mockResolvedValue(RESULTS)} onSelectResult={onSelectResult} />);
    const input = screen.getByRole('combobox', { name: 'Delivery address' });

    typeInto(input, 'Jaro');
    await flushSearch();
    fireEvent.keyDown(input, { key: 'Escape' });

    expect(screen.queryByRole('option')).toBeNull();
    expect(onSelectResult).not.toHaveBeenCalled();
    expect(input.value).toBe('Jaro');
  });

  it('clears the controlled value through the full-clear callback when X is clicked', () => {
    const onClear = vi.fn();
    render(<Harness searchAddresses={vi.fn()} initialValue="Jaro" onClear={onClear} />);
    const input = screen.getByRole('combobox', { name: 'Delivery address' });

    fireEvent.click(screen.getByRole('button', { name: 'Clear delivery address' }));

    expect(onClear).toHaveBeenCalledTimes(1);
    expect(input.value).toBe('');
  });

  it('uses the full-clear callback when deleting the final character', () => {
    const onClear = vi.fn();
    render(<Harness searchAddresses={vi.fn()} initialValue="Jaro" onClear={onClear} />);
    const input = screen.getByRole('combobox', { name: 'Delivery address' });

    fireEvent.change(input, { target: { value: '' } });

    expect(onClear).toHaveBeenCalledTimes(1);
    expect(input.value).toBe('');
  });

  it('says so when nothing matches, and points to the map instead', async () => {
    render(<Harness searchAddresses={vi.fn().mockResolvedValue([])} />);

    typeInto(screen.getByRole('combobox', { name: 'Delivery address' }), 'Zzzz');
    await flushSearch();

    expect(screen.getByRole('status').textContent).toMatch(/No matching address/);
  });

  it('keeps the typed text and offers the map when search is unavailable', async () => {
    render(<Harness searchAddresses={vi.fn().mockRejectedValue(new Error('429'))} />);
    const input = screen.getByRole('combobox', { name: 'Delivery address' });

    typeInto(input, 'Jaro');
    await flushSearch();

    expect(screen.getByRole('status').textContent).toMatch(/unavailable right now/);
    expect(input.value).toBe('Jaro');
  });

  it('shows a "finding the address" placeholder while the pin is being reverse-geocoded', () => {
    render(<DeliveryAddressSearchField value="" resolving searchAddresses={vi.fn()} />);
    expect(screen.getByRole('combobox', { name: 'Delivery address' }).placeholder).toBe('Finding the address for your pin…');
  });
});
