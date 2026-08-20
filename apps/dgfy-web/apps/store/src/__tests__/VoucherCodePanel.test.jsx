// @vitest-environment jsdom

import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { VoucherCodePanel } from '../shared/components/storefront/VoucherCodePanel.jsx';

// #776/#695: mirrors PromoCodePanel.test.jsx's "Available Promos" coverage, retargeted at
// VoucherCodePanel's merged availableOffers prop and onApplyVoucher dispatch -- proves the listing
// behavior PromoCodePanel had wasn't lost when the two panels were merged into one.

afterEach(() => {
  cleanup();
});

describe('VoucherCodePanel', () => {
  it('applies the promo_code from an available offer card via onApplyVoucher', () => {
    const onChange = vi.fn();
    const onApplyVoucher = vi.fn();

    render(
      <VoucherCodePanel
        code=""
        onChange={onChange}
        onApplyVoucher={onApplyVoucher}
        availableOffers={[
          {
            title: 'Weekend Saver',
            subtitle: '20% off selected items',
            promo_code: 'SAVE20'
          }
        ]}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /apply a promo \/ voucher/i }));
    fireEvent.click(screen.getAllByRole('button', { name: /^use$/i })[0]);

    expect(onChange).toHaveBeenCalledWith('SAVE20');
    expect(onApplyVoucher).toHaveBeenCalledWith('SAVE20');
  });

  it('disables scheduled offer use until the availability window begins', () => {
    const onChange = vi.fn();
    const onApplyVoucher = vi.fn();

    render(
      <VoucherCodePanel
        code=""
        onChange={onChange}
        onApplyVoucher={onApplyVoucher}
        availableOffers={[
          {
            title: 'Midnight Saver',
            promo_code: 'MIDNIGHT20',
            availabilityStatus: 'scheduled',
            availabilityMessage: 'Available from Jul 12, 2026, 12:00 AM'
          }
        ]}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /apply a promo \/ voucher/i }));
    const useButton = screen.getByRole('button', { name: /^use$/i });

    expect(useButton.disabled).toBe(true);
    expect(screen.getByText('Available from Jul 12, 2026, 12:00 AM')).toBeTruthy();
    fireEvent.click(useButton);
    expect(onChange).not.toHaveBeenCalled();
    expect(onApplyVoucher).not.toHaveBeenCalled();
  });

  it('renders offer code and eligibility metadata from the merged promo/voucher shape', () => {
    render(
      <VoucherCodePanel
        code=""
        availableOffers={[
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

    expect(screen.queryByText(/Available Offers/i)).toBeNull();
    expect(screen.queryByText(/CODE:/i)).toBeNull();
    expect(screen.queryByText('MOM10')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: /apply a promo \/ voucher/i }));

    expect(screen.getByText(/CODE:/i)).toBeTruthy();
    expect(screen.getByText('MOM10')).toBeTruthy();
    expect(screen.getByText('10%')).toBeTruthy();
    expect(screen.getByText(/Eligible items:/i)).toBeTruthy();
    expect(screen.getByText(/Eligible categories:/i)).toBeTruthy();
    expect(screen.getByRole('button', { name: /^use$/i })).toBeTruthy();
  });

  it('hides display-only offers that have no code', () => {
    render(
      <VoucherCodePanel
        code=""
        availableOffers={[
          {
            title: '10% OFF',
            subtitle: 'Non Coffee and Coffee Beverages',
            validityText: 'Valid until May 30, 2026'
          }
        ]}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /apply a promo \/ voucher/i }));

    expect(screen.queryByRole('button', { name: /^use$/i })).toBeNull();
  });

  it('renders backend-driven feedback and applied discount copy', () => {
    render(
      <VoucherCodePanel
        code="SAVE20"
        statusMessage="Voucher applied successfully."
        statusTone="success"
        appliedDiscountText="PHP 20.00 off"
        availableOffers={[]}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /save20 remove/i }));

    expect(screen.getByText('Voucher applied successfully.')).toBeTruthy();
    expect(screen.getByText(/Discount applied: PHP 20.00 off/i)).toBeTruthy();
  });

  it('defaults to an empty listing when availableOffers is omitted (catalog-toolbar call sites)', () => {
    render(<VoucherCodePanel code="" />);

    fireEvent.click(screen.getByRole('button', { name: /apply a promo \/ voucher/i }));

    expect(screen.queryByText(/Available Offers/i)).toBeNull();
    expect(screen.getByText('Promo / Voucher Code')).toBeTruthy();
  });
});
