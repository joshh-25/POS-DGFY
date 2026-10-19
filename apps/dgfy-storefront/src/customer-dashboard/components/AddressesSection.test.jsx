// @vitest-environment jsdom

import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AddressesSection } from './AddressesSection.jsx';

const theme = {
  surface: '#ffffff',
  bg: '#f8fafc',
  border: '#e2e8f0',
  text: '#0f172a',
  muted: '#64748b',
  primary: '#1a4e8d',
  orange: '#ef4444'
};

const addresses = [
  {
    address_id: 10,
    label: 'Home',
    address_line: 'Ibarra Street, Aurora Subdivision, City Proper',
    address_details: 'Blk 5 Lot 12',
    is_default: true
  },
  {
    address_id: 11,
    label: 'Office',
    address_line: 'Oton, Iloilo',
    is_default: false
  }
];

const renderSection = (props = {}) => {
  const onSaveAddress = props.onSaveAddress || vi.fn().mockResolvedValue(true);
  render(
    <AddressesSection
      addresses={addresses}
      isMobileViewport={false}
      onSaveAddress={onSaveAddress}
      onDeleteAddress={vi.fn()}
      onSetDefaultAddress={vi.fn()}
      onUseAddressForCheckout={vi.fn()}
      renderAddressPinEditor={({ renderFormRow }) => renderFormRow({})}
      accountAddressActionId=""
      theme={theme}
      {...props}
    />
  );
  return { onSaveAddress };
};

afterEach(() => {
  cleanup();
});

describe('AddressesSection address lifecycle', () => {
  it('renders saved labels as the card title and keeps the default badge visible', () => {
    renderSection();

    expect(screen.getByText('Home')).toBeTruthy();
    expect(screen.getByText('Office')).toBeTruthy();
    expect(screen.getByText('Ibarra Street, Aurora Subdivision, City Proper')).toBeTruthy();
    expect(screen.getAllByText('Default')).toHaveLength(1);
    expect(screen.getAllByRole('button', { name: 'Set Default' })).toHaveLength(1);
  });

  it('prefills the saved label and default state, then submits both during edit', async () => {
    const { onSaveAddress } = renderSection();

    fireEvent.click(screen.getAllByRole('button', { name: 'Edit' })[0]);

    expect(screen.getByRole('heading', { name: 'Edit Address' })).toBeTruthy();
    expect(screen.getByPlaceholderText('e.g. Home, Office, Near Plaza').value).toBe('Home');
    expect(screen.getByLabelText('House no., Blk/Lot, unit or building').value).toBe('Blk 5 Lot 12');
    expect(screen.getByRole('checkbox', { name: 'Set as default address' }).checked).toBe(true);

    fireEvent.click(screen.getByRole('button', { name: 'Save Address' }));

    await waitFor(() => expect(onSaveAddress).toHaveBeenCalledWith(
      expect.objectContaining({
        label: 'Home',
        address_details: 'Blk 5 Lot 12',
        is_default: true
      }),
      expect.objectContaining({ address_id: 10 })
    ));
  });

  it('submits the new label and assigns a newly saved address as default', async () => {
    const onSaveAddress = vi.fn().mockResolvedValue(true);
    renderSection({ onSaveAddress });

    fireEvent.click(screen.getByRole('button', { name: 'Add New Address' }));
    fireEvent.change(screen.getByLabelText('Full Delivery Address'), {
      target: { value: 'Agarwood Street, Tacas, Jaro' }
    });
    fireEvent.change(screen.getByPlaceholderText('e.g. Home, Office, Near Plaza'), {
      target: { value: 'Delivery' }
    });
    fireEvent.change(screen.getByLabelText('House no., Blk/Lot, unit or building'), {
      target: { value: '  Unit 3B ' }
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save Address' }));

    await waitFor(() => expect(onSaveAddress).toHaveBeenCalledWith(
      expect.objectContaining({
        label: 'Delivery',
        address_line: 'Agarwood Street, Tacas, Jaro',
        address_details: 'Unit 3B',
        is_default: true
      }),
      null
    ));
  });

  it('keeps Save disabled until the house/unit details are given (#2594)', () => {
    const onSaveAddress = vi.fn().mockResolvedValue(true);
    renderSection({ onSaveAddress });

    fireEvent.click(screen.getByRole('button', { name: 'Add New Address' }));
    fireEvent.change(screen.getByLabelText('Full Delivery Address'), {
      target: { value: 'Agarwood Street, Tacas, Jaro' }
    });
    const save = screen.getByRole('button', { name: 'Save Address' });
    expect(save.disabled).toBe(true);
    fireEvent.click(save);
    expect(onSaveAddress).not.toHaveBeenCalled();
  });

  it('shows saved details on the card and flags an address saved without them (#2594)', () => {
    renderSection();

    expect(screen.getByText('Blk 5 Lot 12')).toBeTruthy();
    expect(screen.getAllByText('Missing house or unit details')).toHaveLength(1);
  });

  it('keeps mobile actions compact, right-aligns them, and exposes delete directly', () => {
    renderSection({ isMobileViewport: true });

    expect(screen.getByTestId('customer-address-actions-11').style.justifyContent).toBe('flex-end');
    expect(screen.getByRole('button', { name: 'Set Default' })).toBeTruthy();
    expect(screen.getAllByRole('button', { name: 'Edit' })).toHaveLength(2);
    expect(screen.getByRole('button', { name: 'Delete Office address' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'More actions for Office' })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Delete Office address' }));
    expect(screen.getByText('Delete this address?')).toBeTruthy();
  });
});
