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
    fireEvent.click(screen.getByRole('button', { name: /^use$/i }));

    expect(onChange).toHaveBeenCalledWith('SAVE20');
    expect(onApplyPromo).toHaveBeenCalledWith('SAVE20');
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
