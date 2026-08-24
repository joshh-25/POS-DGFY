/** @vitest-environment jsdom */
import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ServiceCartDrawer } from './ServiceCartDrawer.jsx';

const baseProps = {
  isCheckoutOpen: true,
  setIsCheckoutOpen: vi.fn(),
  cartButtonRef: React.createRef(),
  isMobileViewport: false,
  servicesPrimary: '#0f766e',
  servicesPrimaryDark: '#134e4a',
  servicesPrimarySoft: '#ecfeff',
  servicesPrimaryBorder: 'rgba(15,118,110,0.2)',
  servicesPrimaryShadow: 'rgba(15,118,110,0.24)',
  servicesPrimaryShadowStrong: 'rgba(15,118,110,0.34)',
  servicesDisplayFont: 'Inter, sans-serif',
  serviceCartCount: 1,
  serviceCartLines: [{
    item_id: 7,
    cart_line_id: 'line-7',
    name: 'Comforter Care',
    quantity: 1,
    price: 180,
    selected_options: [{ name: 'Single / Queen' }],
    serviceAreaLabel: 'In-store drop-off',
    durationLabel: '1 hr'
  }],
  cartImageErrors: new Set(),
  setCartImageErrors: vi.fn(),
  money: (value) => `PHP ${Number(value).toFixed(2)}`,
  updateQty: vi.fn(),
  removeCartItem: vi.fn(),
  openServiceCartEditor: vi.fn(),
  productCartLines: [],
  serviceCartTotal: 180,
  hasServiceCart: true,
  handleServicesCartCheckout: vi.fn(),
  renderPromoCodePanel: () => <button type="button">Apply a promo / discount</button>
};

describe('ServiceCartDrawer', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('uses selected service choices and retains live cart actions in the demo-style drawer', () => {
    render(<ServiceCartDrawer {...baseProps} />);

    expect(screen.getByText('Your cart (1)')).toBeTruthy();
    expect(screen.getByText('Review your items before checkout.')).toBeTruthy();
    expect(screen.getByText('Estimated subtotal')).toBeTruthy();
    expect(screen.getByText('Total')).toBeTruthy();
    expect(screen.getByText('Apply a promo / discount')).toBeTruthy();
    expect(screen.getByText('Single / Queen')).toBeTruthy();
    expect(screen.queryByText('In-store drop-off')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Edit Comforter Care' })).toBeNull();
    expect(document.querySelector('[data-service-cart-fab="true"]')?.style.display).toBe('none');
    expect(screen.getByRole('button', { name: 'Decrease quantity for Comforter Care' }).querySelector('svg')?.getAttribute('width')).toBe('14');
    expect(screen.getByRole('button', { name: 'Decrease quantity for Comforter Care' }).querySelector('svg')?.getAttribute('height')).toBe('14');
    expect(screen.getByRole('button', { name: 'Increase quantity for Comforter Care' }).querySelector('svg')?.getAttribute('width')).toBe('14');
    expect(screen.getByRole('button', { name: 'Remove Comforter Care' }).querySelector('svg')?.getAttribute('width')).toBe('16');

    fireEvent.click(screen.getByRole('button', { name: 'Increase quantity for Comforter Care' }));
    expect(baseProps.updateQty).toHaveBeenCalledWith(7, 2, 'line-7');

    fireEvent.click(screen.getByRole('button', { name: 'Remove Comforter Care' }));
    expect(baseProps.removeCartItem).toHaveBeenCalledWith(7, 'line-7');

    fireEvent.click(screen.getByRole('button', { name: /Add more items/ }));
    expect(baseProps.setIsCheckoutOpen).toHaveBeenCalledWith(false);

    fireEvent.click(screen.getByRole('button', { name: 'Continue to booking' }));
    expect(baseProps.handleServicesCartCheckout).toHaveBeenCalledTimes(1);
  });

  it('shows the floating cart button only while the drawer is closed', () => {
    render(<ServiceCartDrawer {...baseProps} isCheckoutOpen={false} />);

    expect(document.querySelector('[data-service-cart-fab="true"]')?.style.display).toBe('grid');
  });
});
