/* @vitest-environment jsdom */
import React from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { FnbProductDesktopPurchasePanel } from '../modes/fnb/storefront/components/FnbProductDesktopPurchasePanel.jsx';
import { FnbProductInfoHeader } from '../modes/fnb/storefront/components/FnbProductInfoHeader.jsx';
import { FnbProductPriceQuantitySelector } from '../modes/fnb/storefront/components/FnbProductPriceQuantitySelector.jsx';

const actionButtonBase = {
  minHeight: 46,
  borderRadius: 12,
  fontSize: 15,
  fontWeight: 700
};

afterEach(cleanup);

describe('retail product-details presentation', () => {
  it('uses retail typography and blue accents for item identity and price', () => {
    render(
      <>
        <FnbProductInfoHeader
          accentColor="#1A4E8D"
          description="Reliable batteries for everyday household devices."
          displayFont="Avenir Next"
          isMobileViewport={false}
          compactTypography
          itemName="AA Batteries 2-Pack"
          ratingScore={0}
          reviewCount={0}
          spacing={(value) => value * 8}
        />
        <FnbProductPriceQuantitySelector
          accentColor="#1A4E8D"
          formatMoney={(value) => `PHP ${Number(value).toFixed(2)}`}
          isMobileViewport={false}
          compactTypography
          quantity={1}
          setQuantity={vi.fn()}
          spacing={(value) => value * 8}
          unitPrice={55}
        />
      </>
    );

    expect(screen.getByRole('heading', { name: 'AA Batteries 2-Pack' }).style.fontWeight).toBe('700');
    expect(screen.getByText('PHP 55.00').style.color).toBe('rgb(26, 78, 141)');
    expect(screen.getByText('PHP 55.00').style.fontWeight).toBe('700');
  });

  it('uses retail blue for both product-detail purchase actions', () => {
    render(
      <FnbProductDesktopPurchasePanel
        accentColor="#1A4E8D"
        accentDark="#1A4586"
        actionButtonBase={actionButtonBase}
        available
        formatMoney={(value) => `PHP ${Number(value).toFixed(2)}`}
        compactTypography
        onAddToCart={vi.fn()}
        onBuyNow={vi.fn()}
        selectedModifiersTotal={0}
        totalPrice={55}
      />
    );

    expect(screen.getByRole('button', { name: 'Add to Cart' }).style.background).toBe('rgb(26, 69, 134)');
    expect(screen.getByRole('button', { name: 'Buy Now' }).style.background).toBe('rgb(26, 78, 141)');
  });

  it('preserves the existing F&B defaults when retail presentation is absent', () => {
    render(
      <>
        <FnbProductInfoHeader
          description="Freshly prepared menu item."
          isMobileViewport={false}
          itemName="House Special"
          ratingScore={0}
          reviewCount={0}
          spacing={(value) => value * 8}
        />
        <FnbProductPriceQuantitySelector
          formatMoney={(value) => `PHP ${Number(value).toFixed(2)}`}
          isMobileViewport={false}
          quantity={1}
          setQuantity={vi.fn()}
          spacing={(value) => value * 8}
          unitPrice={120}
        />
      </>
    );

    expect(screen.getByRole('heading', { name: 'House Special' }).style.fontWeight).toBe('900');
    expect(screen.getByText('PHP 120.00').style.color).toBe('rgb(249, 115, 22)');
    expect(screen.getByText('PHP 120.00').style.fontWeight).toBe('900');
  });
});
