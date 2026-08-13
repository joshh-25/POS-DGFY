/** @vitest-environment jsdom */
import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ServiceCatalogCard } from './ServiceCatalogCard.jsx';

const baseProps = {
  item: {
    item_id: 1,
    name: 'Wash, Dry & Fold',
    variantName: 'Wash, Dry & Fold',
    description: 'A practical laundry package.',
    default_sale_price: 150,
    categoryMeta: { label: 'Laundry Packages' }
  },
  imageSources: { src: '' },
  available: true,
  money: (value) => `PHP ${Number(value).toFixed(2)}`,
  servicesPrimary: '#0f766e',
  servicesPrimaryDark: '#134e4a',
  servicesPrimarySoft: '#ecfeff',
  servicesPrimaryBorder: 'rgba(15,118,110,0.2)',
  servicesPrimaryShadow: 'rgba(15,118,110,0.24)',
  addActionLabel: 'Add service',
  unavailableLabel: 'Unavailable',
  missingImageLabel: 'No service image',
  onAdd: vi.fn()
};

describe('ServiceCatalogCard', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('renders service data with one add action and no details action', () => {
    render(<ServiceCatalogCard {...baseProps} />);

    expect(screen.getByRole('heading', { name: 'Wash, Dry & Fold' })).toBeTruthy();
    expect(screen.getByText('Laundry Packages')).toBeTruthy();
    expect(screen.getByText('PHP 150.00')).toBeTruthy();
    expect(screen.getByText('A practical laundry package.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /View Details/i })).toBeNull();

    const addServiceButton = screen.getByRole('button', { name: /Add service/i });
    expect(addServiceButton.querySelector('svg')?.getAttribute('width')).toBe('18');
    fireEvent.click(addServiceButton);
    expect(baseProps.onAdd).toHaveBeenCalledTimes(1);
  });

  it('uses configured empty and unavailable labels without inventing service options', () => {
    render(<ServiceCatalogCard {...baseProps} available={false} />);

    expect(screen.getByText('No service image')).toBeTruthy();
    expect(screen.getAllByText('Unavailable')).toHaveLength(2);
    expect(screen.getByRole('button', { name: /Unavailable/i }).disabled).toBe(true);
    expect(screen.queryByRole('combobox')).toBeNull();
  });

  it('renders assigned options, updates the displayed price, and adds their real ids', () => {
    render(<ServiceCatalogCard
      {...baseProps}
      item={{
        ...baseProps.item,
        service_option_groups: [{
          group_id: 7,
          name: 'Package size',
          group_type: 'variation',
          selection_type: 'single',
          min_selections: 1,
          max_selections: 1,
          is_required: true,
          options: [{ option_id: 70, name: 'First 5 kilos', price_adjustment_centavos: 0 },
            { option_id: 71, name: 'Up to 10 kilos', price_adjustment_centavos: 5000 }]
        }]
      }}
    />);

    expect(screen.getByRole('combobox', { name: 'Package size' }).value).toBe('70');
    fireEvent.change(screen.getByRole('combobox', { name: 'Package size' }), { target: { value: '71' } });
    expect(screen.getByText('PHP 200.00')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: /Add service/i }));
    expect(baseProps.onAdd).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      selected_option_ids: [71],
      unit_price: 200,
      selected_options: [expect.objectContaining({ option_id: 71, group_id: 7, name: 'Up to 10 kilos' })]
    }));
  });

  it('shows a configured single-choice add-on in the card dropdown and carries it into the cart', () => {
    render(<ServiceCatalogCard
      {...baseProps}
      item={{
        ...baseProps.item,
        service_option_groups: [{
          group_id: 9,
          name: 'Extra care',
          group_type: 'addon',
          selection_type: 'single',
          min_selections: 0,
          max_selections: 1,
          is_required: false,
          options: [{ option_id: 91, name: 'Stain treatment', price_adjustment_centavos: 2500 }]
        }]
      }}
    />);

    const addOnDropdown = screen.getByRole('combobox', { name: 'Extra care' });
    expect(addOnDropdown.value).toBe('');
    fireEvent.change(addOnDropdown, { target: { value: '91' } });
    expect(screen.getByText('PHP 175.00')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: /Add service/i }));
    expect(baseProps.onAdd).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      selected_option_ids: [91],
      unit_price: 175,
      selected_options: [expect.objectContaining({ option_id: 91, group_id: 9, name: 'Stain treatment' })]
    }));
  });
});
