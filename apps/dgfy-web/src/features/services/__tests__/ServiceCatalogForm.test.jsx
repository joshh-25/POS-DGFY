// @vitest-environment jsdom
import React, { useState } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import ServiceCatalogForm from '../components/ServiceCatalogForm.jsx';
import { createServiceCatalogFormValues } from '../catalog/serviceCatalogFormModel.js';

const Harness = ({ onSave, saving = false }) => {
  const [values, setValues] = useState(createServiceCatalogFormValues);
  return (
    <ServiceCatalogForm
      values={values}
      onChange={setValues}
      onSubmit={(event) => {
        event.preventDefault();
        onSave(values);
      }}
      saving={saving}
    />
  );
};

describe('ServiceCatalogForm', () => {
  afterEach(() => cleanup());

  it('preserves the existing service-create fields and controlled submit flow', () => {
    const onSave = vi.fn();
    render(<Harness onSave={onSave} />);

    fireEvent.change(screen.getByLabelText('Service Name'), { target: { value: 'Laundry Basket' } });
    fireEvent.change(screen.getByLabelText('Price'), { target: { value: '5000' } });
    fireEvent.change(screen.getByLabelText('Duration'), { target: { value: '90' } });
    fireEvent.change(screen.getByLabelText('Buffer Before (minutes)'), { target: { value: '10' } });
    fireEvent.change(screen.getByLabelText('VAT Classification'), { target: { value: 'vat_exempt' } });
    fireEvent.click(screen.getByRole('switch', { name: 'Track internal service cost' }));
    fireEvent.change(screen.getByLabelText('Internal Service Cost'), { target: { value: '1200' } });
    fireEvent.click(screen.getByRole('switch', { name: 'Show this service in Storefront' }));
    fireEvent.click(screen.getByRole('switch', { name: 'Allow add-ons for this service' }));
    fireEvent.click(screen.getByRole('button', { name: 'Create Service' }));

    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({
      name: 'Laundry Basket',
      default_sale_price: '5000',
      duration_minutes: '90',
      buffer_before_minutes: '10',
      vat_type: 'vat_exempt',
      track_internal_cost: true,
      cost_per_unit: '1200',
      visible_in_storefront: false,
      addons_enabled: true
    }));
  });

  it('disables mutation controls while saving', () => {
    render(<Harness onSave={vi.fn()} saving />);

    expect(screen.getByLabelText('Service Name').disabled).toBe(true);
    expect(screen.getByRole('switch', { name: 'Allow add-ons for this service' }).disabled).toBe(true);
    expect(screen.getByRole('switch', { name: 'Show this service in POS' }).disabled).toBe(true);
    expect(screen.getByRole('button', { name: 'Saving...' }).disabled).toBe(true);
  });

  it('shows status only when requested by an edit surface', () => {
    const values = createServiceCatalogFormValues({ name: 'Laundry', status: 'inactive' });
    const { rerender } = render(<ServiceCatalogForm values={values} onChange={vi.fn()} onSubmit={vi.fn()} />);

    expect(screen.queryByLabelText('Status')).toBeNull();

    rerender(<ServiceCatalogForm values={values} onChange={vi.fn()} onSubmit={vi.fn()} showStatus />);
    expect(screen.getByLabelText('Status').value).toBe('inactive');
  });
});
