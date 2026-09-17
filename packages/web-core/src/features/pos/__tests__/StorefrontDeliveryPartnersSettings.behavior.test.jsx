/** @vitest-environment jsdom */
import React, { useState } from 'react';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import StorefrontDeliveryPartnersSettings from '../settings/StorefrontDeliveryPartnersSettings.jsx';

afterEach(cleanup);

function ControlledPartners({ initialPartners = [], onChange }) {
  const [partners, setPartners] = useState(initialPartners);
  return <StorefrontDeliveryPartnersSettings partners={partners} onChange={(next) => { setPartners(next); onChange?.(next); }} />;
}

describe('Storefront delivery partners settings', () => {
  it('renders supported partners in a compact responsive list without unsupported controls', () => {
    render(<StorefrontDeliveryPartnersSettings partners={[
      { partner: 'grab', url: 'https://grab.com/store' },
      { partner: 'foodpanda', url: 'https://foodpanda.test/store' },
      { partner: 'lalamove', url: 'https://lalamove.test/store' },
      { partner: 'custom', label: 'Local Courier', url: 'https://courier.test/store' }
    ]} />);

    expect(screen.getByRole('heading', { name: 'Delivery Partners', exact: true })).toBeTruthy();
    expect(screen.getByRole('list', { name: 'Storefront delivery partners', exact: true })).toBeTruthy();
    expect(screen.getAllByRole('listitem')).toHaveLength(4);
    expect(screen.getByRole('listitem', { name: 'Grab delivery partner', exact: true })).toBeTruthy();
    expect(screen.getByRole('listitem', { name: 'Local Courier delivery partner', exact: true })).toBeTruthy();
    expect(screen.getByRole('img', { name: 'Grab logo', exact: true }).querySelector('img')).toBeTruthy();
    expect(screen.getByRole('img', { name: 'foodpanda logo', exact: true }).querySelector('img')).toBeTruthy();
    expect(screen.getByRole('img', { name: 'Lalamove logo', exact: true }).querySelector('img')).toBeTruthy();
    expect(screen.queryByText('MrSpeedy')).toBeNull();
    expect(screen.queryByText('Enable')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'More information about Delivery Partners', exact: true }));
    expect(screen.getByText('You have reached the maximum of 4 delivery partners.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Add delivery partner (maximum of 4 reached)', exact: true }).disabled).toBe(true);
  });

  it('treats a legacy blank object as empty and adds a partner through the modal', () => {
    const onChange = vi.fn();
    render(<ControlledPartners initialPartners={[{ partner: 'grab', label: '', url: '' }]} onChange={onChange} />);

    expect(screen.getByRole('heading', { name: 'No delivery partners added yet.', exact: true })).toBeTruthy();
    expect(screen.getAllByRole('button', { name: 'Add delivery partner', exact: true })).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: 'Add delivery partner', exact: true }));
    const dialog = screen.getByRole('dialog');
    expect(dialog.parentElement?.parentElement).toBe(document.body);
    fireEvent.change(within(dialog).getByLabelText('Delivery Partner *'), { target: { value: 'grab' } });
    fireEvent.change(within(dialog).getByLabelText('Partner Link *'), { target: { value: 'https://grab.com/store' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Add Partner', exact: true }));
    expect(onChange).toHaveBeenLastCalledWith([{ partner: 'grab', label: '', url: 'https://grab.com/store' }]);
  });

  it('prevents duplicate platform selection and validates the partner link', () => {
    render(<ControlledPartners initialPartners={[{ partner: 'grab', url: 'https://grab.com/store' }]} />);
    fireEvent.click(screen.getByRole('button', { name: 'Add delivery partner', exact: true }));
    const dialog = screen.getByRole('dialog');
    const select = within(dialog).getByLabelText('Delivery Partner *');
    expect(within(select).getByRole('option', { name: /Grab \(already added\)/ })).toHaveProperty('disabled', true);
    fireEvent.change(select, { target: { value: 'foodpanda' } });
    expect(within(dialog).getByText('Partner link is required.')).toBeTruthy();
    expect(within(dialog).getByRole('button', { name: 'Add Partner', exact: true }).disabled).toBe(true);
    fireEvent.change(within(dialog).getByLabelText('Partner Link *'), { target: { value: 'foodpanda.test/store' } });
    expect(within(dialog).getByText('Enter a valid URL.')).toBeTruthy();
  });

  it('supports edit and remove actions without status or ordering controls', () => {
    const onChange = vi.fn();
    render(<ControlledPartners initialPartners={[{ partner: 'custom', label: 'Local Courier', url: 'https://courier.test/store' }]} onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: 'Local Courier actions', exact: true }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Edit', exact: true }));
    const editRow = screen.getByRole('listitem', { name: 'Local Courier delivery partner', exact: true });
    const editForm = within(editRow).getByLabelText('Edit Local Courier');
    fireEvent.change(within(editForm).getByLabelText('Partner Name *'), { target: { value: 'City Courier' } });
    fireEvent.change(within(editForm).getByLabelText('Partner Link *'), { target: { value: 'https://city.test/store' } });
    fireEvent.click(within(editForm).getByRole('button', { name: 'Save Changes', exact: true }));
    expect(onChange).toHaveBeenLastCalledWith([{ partner: 'custom', label: 'City Courier', url: 'https://city.test/store' }]);

    fireEvent.click(screen.getByRole('button', { name: 'City Courier actions', exact: true }));
    const removeMenuItem = screen.getByRole('menuitem', { name: 'Remove', exact: true });
    expect(removeMenuItem.className).toContain('bg-rose-50');
    expect(removeMenuItem.className).toContain('border-rose-200');
    fireEvent.click(removeMenuItem);
    const removeDialog = screen.getByRole('dialog');
    expect(within(removeDialog).getByText('It will no longer appear on your storefront.')).toBeTruthy();
    fireEvent.click(within(removeDialog).getByRole('button', { name: 'Remove', exact: true }));
    expect(onChange).toHaveBeenLastCalledWith([]);
  });
});
