// @vitest-environment jsdom

import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PromoCodePanel } from '../checkout/components/PromoCodePanel.jsx';

afterEach(() => {
  cleanup();
});

describe('PromoCodePanel', () => {
  it('applies the real promo_code from an available promo card', () => {
    const onChange = vi.fn();
    const onApplyPromo = vi.fn();

    render(
      <PromoCodePanel
        code=""
        onChange={onChange}
        onApplyPromo={onApplyPromo}
        availablePromos={[
          {
            title: 'Weekend Saver',
            subtitle: '20% off selected items',
            promo_code: 'SAVE20'
          }
        ]}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /apply a promo/i }));
    fireEvent.click(screen.getAllByRole('button', { name: /^use$/i })[0]);

    expect(onChange).toHaveBeenCalledWith('SAVE20');
    expect(onApplyPromo).toHaveBeenCalledWith('SAVE20');
  });

  it('renders promo code and eligibility metadata from the storefront promo contract', () => {
    render(
      <PromoCodePanel
        code=""
        availablePromos={[
          {
            title: 'Mother Day Promo',
            subtitle: 'Non Coffee and Coffee Beverages',
            promo_code: 'MOM10',
            discountLabel: '10% OFF',
            eligibleItemsText: 'Banana Matcha, Americano',
            eligibleCategoriesText: 'Coffee, Non Coffee',
            validityText: 'Valid until May 30, 2026'
          }
        ]}
      />
    );

    expect(screen.queryByText(/Current Promos/i)).toBeNull();
    expect(screen.queryByText(/Promo Code:/i)).toBeNull();
    expect(screen.queryByText('MOM10')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: /apply a promo/i }));

    expect(screen.getByText(/Promo Code:/i)).toBeTruthy();
    expect(screen.getByText('MOM10')).toBeTruthy();
    expect(screen.getByText('10% OFF')).toBeTruthy();
    expect(screen.getByText(/Eligible items:/i)).toBeTruthy();
    expect(screen.getByText(/Eligible categories:/i)).toBeTruthy();
    expect(screen.getByRole('button', { name: /^use$/i })).toBeTruthy();
  });

  it('does not show a fake Use action when POS has not saved a promo_code', () => {
    render(
      <PromoCodePanel
        code=""
        availablePromos={[
          {
            title: '10% OFF',
            subtitle: 'Non Coffee and Coffee Beverages',
            validityText: 'Valid until May 30, 2026'
          }
        ]}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /apply a promo/i }));

    expect(screen.queryByRole('button', { name: /^use$/i })).toBeNull();
    expect(screen.getByText('Promo code not set')).toBeTruthy();
  });

  it('renders backend-driven promo feedback and applied discount copy', () => {
    render(
      <PromoCodePanel
        code="SAVE20"
        statusMessage="Promo applied successfully."
        statusTone="success"
        appliedDiscountText="PHP 20.00 off"
        availablePromos={[]}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /save20 remove/i }));

    expect(screen.getByText('Promo applied successfully.')).toBeTruthy();
    expect(screen.getByText(/Discount applied: PHP 20.00 off/i)).toBeTruthy();
  });
});
