/** @vitest-environment jsdom */
import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ServiceBookingAddOnsStep } from './ServiceBookingAddOnsStep.jsx';

const Button = ({ children, ...props }) => <button type="button" {...props}>{children}</button>;

const baseProps = {
  STYLES: { colors: { dark: '#0f172a', muted: '#64748b' } },
  GhostButton: Button,
  PrimaryButton: Button,
  primaryButtonProps: {},
  isMobileViewport: false,
  money: (value) => `PHP ${Number(value).toFixed(2)}`,
  servicesPrimary: '#1A4E8D',
  servicesPrimarySoft: '#EEF6FD',
  servicesPrimaryBorder: 'rgba(26,78,141,0.2)',
  servicesDisplayFont: 'Inter, sans-serif',
  serviceOrderMethod: 'delivery',
  onEditLine: vi.fn(),
  specialInstructions: '',
  setSpecialInstructions: vi.fn(),
  setServiceBookingStep: vi.fn(),
  referenceStyle: false
};

describe('ServiceBookingAddOnsStep', () => {
  afterEach(cleanup);

  it('shows a non-interactive empty state when a service has no add-ons', () => {
    render(
      <ServiceBookingAddOnsStep
        {...baseProps}
        serviceLines={[{ key: 'service-1', title: 'Basic Wash', selectedOptions: [], hasAvailableAddOns: false }]}
      />
    );

    expect(screen.getByText('No add-ons available')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Expand service options' })).toBeNull();
  });

  it('keeps configured add-ons collapsed by default', () => {
    render(
      <ServiceBookingAddOnsStep
        {...baseProps}
        serviceLines={[{
          key: 'service-2',
          title: 'Premium Wash',
          selectedOptions: [],
          serviceOptionGroups: [{
            group_id: 20,
            name: 'Extras',
            group_type: 'addon',
            selection_type: 'multi',
            min_selections: 0,
            max_selections: 2,
            is_required: false,
            options: [{ option_id: 201, name: 'Detergent', price_adjustment_centavos: 2000 }]
          }]
        }]}
      />
    );

    expect(screen.getByText('With Add-ons')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Expand service options' })).toBeTruthy();
    expect(screen.queryByRole('checkbox', { name: 'Detergent' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Expand service options' }));
    expect(screen.getByRole('checkbox', { name: 'Detergent' })).toBeTruthy();
  });

  it('keeps the mobile service identity and add-on controls in balanced rows', () => {
    render(
      <ServiceBookingAddOnsStep
        {...baseProps}
        isMobileViewport
        serviceLines={[{
          key: 'service-mobile',
          title: 'Mobile Wash',
          selectedOptions: [],
          serviceOptionGroups: [{
            group_id: 40,
            name: 'Extras',
            group_type: 'addon',
            selection_type: 'multi',
            min_selections: 0,
            max_selections: 2,
            is_required: false,
            options: [{ option_id: 401, name: 'Detergent', price_adjustment_centavos: 2000 }]
          }]
        }]}
      />
    );

    const identityButton = screen.getByRole('button', { name: 'Edit Mobile Wash' });
    const badge = screen.getByText('With Add-ons');
    const identityContent = screen.getByText('Mobile Wash').parentElement;
    const cardContent = identityButton.parentElement;

    expect(identityButton.style.gridColumn).toBe('1 / 3');
    expect(identityButton.style.display).toBe('grid');
    expect(identityButton.style.gridTemplateColumns).toBe('subgrid');
    expect(identityContent).toBe(badge.parentElement);
    expect(identityContent?.style.display).toBe('grid');
    expect(identityContent?.style.alignContent).toBe('start');
    expect(identityContent?.style.gap).toBe('6px');
    expect(cardContent?.style.gridTemplateColumns).toBe('48px minmax(0, 1fr) auto');
    expect(badge.style.background).toBe('rgb(26, 78, 141)');
    expect(badge.style.color).toBe('rgb(255, 255, 255)');
  });

  it('keeps the desktop service identity and status controls in the original horizontal row', () => {
    render(
      <ServiceBookingAddOnsStep
        {...baseProps}
        serviceLines={[{
          key: 'service-desktop',
          title: 'Desktop Wash',
          selectedOptions: [],
          serviceOptionGroups: [{
            group_id: 50,
            name: 'Extras',
            group_type: 'addon',
            selection_type: 'multi',
            min_selections: 0,
            max_selections: 2,
            is_required: false,
            options: [{ option_id: 501, name: 'Detergent', price_adjustment_centavos: 2000 }]
          }]
        }]}
      />
    );

    const identityButton = screen.getByRole('button', { name: 'Edit Desktop Wash' });
    const badge = screen.getByText('With Add-ons');
    const cardContent = identityButton.parentElement;

    expect(identityButton.style.display).toBe('contents');
    expect(cardContent?.style.gridTemplateColumns).toBe('56px minmax(0, 1fr) auto');
    expect(badge.parentElement?.style.gridColumn).toBe('3');
    expect(badge.parentElement?.style.display).toBe('flex');
    expect(screen.getByRole('button', { name: 'Expand service options' })).toBeTruthy();
  });

  it('renders configured add-ons without variations and returns the selected option', () => {
    const onUpdateLineOptions = vi.fn();
    render(
      <ServiceBookingAddOnsStep
        {...baseProps}
        onUpdateLineOptions={onUpdateLineOptions}
        serviceLines={[{
          key: 'service-3',
          title: 'Premium Wash',
          selectedOptions: [{ option_id: 301, group_id: 30, group_name: 'Package size', group_type: 'variation', name: 'Large' }],
          serviceOptionGroups: [{
            group_id: 30,
            name: 'Package size',
            group_type: 'variation',
            selection_type: 'single',
            min_selections: 1,
            max_selections: 1,
            is_required: true,
            options: [{ option_id: 301, name: 'Large' }]
          }, {
            group_id: 31,
            name: 'Extra care',
            group_type: 'addon',
            selection_type: 'single',
            min_selections: 0,
            max_selections: 1,
            is_required: false,
            options: [{ option_id: 311, name: 'Stain treatment', price_adjustment_centavos: 2500 }]
          }]
        }]}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Expand service options' }));
    expect(screen.queryByRole('combobox', { name: 'Package size' })).toBeNull();
    expect(screen.queryByRole('combobox', { name: 'Extra care' })).toBeNull();
    fireEvent.click(screen.getByRole('checkbox', { name: 'Stain treatment' }));

    expect(onUpdateLineOptions).toHaveBeenCalledWith('service-3', [
      expect.objectContaining({ option_id: 301, group_type: 'variation' }),
      expect.objectContaining({ option_id: 311, group_type: 'addon', name: 'Stain treatment' })
    ], expect.arrayContaining([
      expect.objectContaining({ group_id: 31, group_type: 'addon' })
    ]));
  });
});
