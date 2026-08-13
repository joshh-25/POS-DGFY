/* @vitest-environment jsdom */
import React from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { RetailProductCard } from '../modes/retail/storefront/components/RetailProductCard.jsx';

const baseProps = {
  FNB_CATEGORY_ICON_MAP: {},
  available: true,
  addToCart: vi.fn(),
  buttonTextOnAccent: '#ffffff',
  fnbViewMode: 'grid',
  getCartFlySourceRect: vi.fn(() => null),
  heroTheme: {
    accent: '#1A4E8D',
    accentDark: '#1A4586',
    borderSoft: '#E2E8F0',
    textPrimary: '#0F172A',
    bodyFont: "'Avenir Next', 'Segoe UI', sans-serif",
    displayFont: "'Avenir Next', 'Segoe UI', sans-serif"
  },
  imageSources: { src: '' },
  isMobileViewport: false,
  item: {
    item_id: 1,
    name: 'Northline Canvas Tote',
    default_sale_price: 399,
    descriptionPreview: 'A sturdy reusable tote for groceries, work, or weekend errands.',
    sectionLabel: 'Everyday'
  },
  money: (value) => `₱${Number(value).toFixed(2)}`,
  onViewDetails: vi.fn()
};

afterEach(cleanup);

describe('RetailProductCard', () => {
  it('renders the retail card hierarchy without an unsupported variant dropdown', () => {
    render(<RetailProductCard {...baseProps} />);

    expect(screen.getByRole('heading', { name: 'Northline Canvas Tote' })).toBeTruthy();
    expect(screen.getByText('Everyday')).toBeTruthy();
    expect(screen.getByText('₱399.00')).toBeTruthy();
    expect(screen.getByText('A sturdy reusable tote for groceries, work, or weekend errands.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Add to Cart' })).toBeTruthy();
    expect(screen.queryByRole('combobox')).toBeNull();
    expect(screen.getByRole('heading', { name: 'Northline Canvas Tote' }).style.fontWeight).toBe('700');
    expect(screen.getByText('₱399.00').style.fontWeight).toBe('700');
  });

  it('keeps the mobile product action at the minimum touch-friendly height', () => {
    render(<RetailProductCard {...baseProps} isMobileViewport />);

    expect(screen.getByRole('button', { name: 'Add to Cart' }).style.height).toBe('44px');
  });
});
