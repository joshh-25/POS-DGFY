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
  servicesPrimary: '#1A4E8D',
  servicesPrimaryDark: '#1A4586',
  servicesPrimarySoft: '#EEF6FD',
  servicesPrimaryBorder: 'rgba(26,78,141,0.2)',
  servicesPrimaryShadow: 'rgba(26,78,141,0.24)',
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

  it('renders the Services mobile list card with the demo arrangement', () => {
    const { container } = render(
      <ServiceCatalogCard
        {...baseProps}
        isMobileViewport
        servicesViewMode="list"
      />
    );

    const card = container.querySelector('[data-service-catalog-view="list"]');
    expect(card).toBeTruthy();
    expect(card.style.display).toBe('flex');
    expect(card.style.minHeight).toBe('120px');
    expect(card.firstElementChild.style.width).toBe('88px');
    expect(screen.queryByText('Laundry Packages')).toBeNull();
    expect(screen.getByText('A practical laundry package.').style.minHeight).toBe('34px');
    const addServiceButton = screen.getByRole('button', { name: 'Add service Wash, Dry & Fold' });
    expect(addServiceButton).toBeTruthy();
    expect(addServiceButton.style.width).toBe('100%');
    expect(addServiceButton.style.height).toBe('38px');
    expect(addServiceButton.textContent).toContain('Add service');
    expect(addServiceButton.querySelector('svg')).toBeTruthy();
  });

  it('keeps the F&B-sized single-column mobile grid geometry for Services', () => {
    const { container } = render(
      <ServiceCatalogCard
        {...baseProps}
        isMobileViewport
        servicesViewMode="grid"
      />
    );

    const card = container.querySelector('[data-service-catalog-view="grid"]');
    expect(card).toBeTruthy();
    expect(card.style.width).toBe('calc(100% - 8px)');
    expect(card.style.borderRadius).toBe('20px');
    expect(card.firstElementChild.style.height).toBe('140px');
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

    const packageSizeDropdown = screen.getByRole('combobox', { name: 'Package size required' });
    expect(packageSizeDropdown.textContent).toContain('First 5 kilos');
    fireEvent.click(packageSizeDropdown);
    fireEvent.click(screen.getByRole('option', { name: 'Up to 10 kilos (+PHP 50.00)' }));
    expect(screen.getByText('PHP 200.00')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: /Add service/i }));
    expect(baseProps.onAdd).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      selected_option_ids: [71],
      unit_price: 200,
      selected_options: [expect.objectContaining({ option_id: 71, group_id: 7, name: 'Up to 10 kilos' })]
    }));
  });

  it('keeps configured add-ons out of the catalog card while carrying their groups into the cart', () => {
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

    expect(screen.queryByRole('combobox', { name: 'Extra care' })).toBeNull();
    expect(screen.getByText('PHP 150.00')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: /Add service/i }));
    expect(baseProps.onAdd).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      selected_option_ids: [],
      unit_price: 150,
      selected_options: [],
      service_option_groups: [expect.objectContaining({ group_id: 9, group_type: 'addon' })]
    }));
  });
});
