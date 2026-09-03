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
  servicesPrimary: '#1A4E8D',
  servicesPrimaryDark: '#1A4586',
  servicesPrimarySoft: '#EEF6FD',
  servicesPrimaryBorder: 'rgba(26,78,141,0.2)',
  servicesPrimaryShadow: 'rgba(26,78,141,0.24)',
  servicesPrimaryShadowStrong: 'rgba(26,78,141,0.32)',
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
  goStoreCatalogPage: vi.fn(),
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
    expect(document.querySelector('[data-service-cart-lines="true"]')?.style.paddingTop).toBe('0px');
    expect(document.querySelector('[data-service-cart-lines="true"]')?.style.paddingBottom).toBe('14px');
    expect(document.querySelector('[data-service-cart-drawer="true"] article')?.style.padding).toBe('14px 0px');
    expect(screen.queryByRole('button', { name: 'Edit Comforter Care' })).toBeNull();
    expect(document.querySelector('[data-service-cart-fab="true"]')?.style.display).toBe('none');
    expect(screen.getByRole('button', { name: 'Decrease quantity for Comforter Care' }).querySelector('svg')?.getAttribute('width')).toBe('14');
    expect(screen.getByRole('button', { name: 'Decrease quantity for Comforter Care' }).querySelector('svg')?.getAttribute('height')).toBe('14');
    expect(screen.getByRole('button', { name: 'Increase quantity for Comforter Care' }).querySelector('svg')?.getAttribute('width')).toBe('14');
    expect(screen.getByRole('button', { name: 'Remove Comforter Care' }).querySelector('svg')?.getAttribute('width')).toBe('16');
    const quantityInput = screen.getByRole('spinbutton', { name: 'Quantity for Comforter Care' });
    expect(quantityInput.value).toBe('1');
    expect(quantityInput.type).toBe('text');
    expect(quantityInput.inputMode).toBe('numeric');
    expect(quantityInput.pattern).toBe('[0-9]*');
    expect(quantityInput.getAttribute('aria-valuemin')).toBe('1');
    expect(quantityInput.getAttribute('aria-valuenow')).toBe('1');

    fireEvent.focus(quantityInput);
    expect(quantityInput.selectionStart).toBe(0);
    expect(quantityInput.selectionEnd).toBe(quantityInput.value.length);

    fireEvent.keyDown(quantityInput, { key: 'a' });
    expect(quantityInput.value).toBe('1');
    fireEvent.change(quantityInput, { target: { value: '12' } });
    expect(quantityInput.value).toBe('12');
    fireEvent.change(quantityInput, { target: { value: '3' } });
    fireEvent.keyDown(quantityInput, { key: 'Enter' });
    expect(baseProps.updateQty).toHaveBeenCalledWith(7, 3, 'line-7');

    fireEvent.click(screen.getByRole('button', { name: 'Increase quantity for Comforter Care' }));
    expect(baseProps.updateQty).toHaveBeenCalledWith(7, 2, 'line-7');

    fireEvent.click(screen.getByRole('button', { name: 'Remove Comforter Care' }));
    expect(baseProps.removeCartItem).toHaveBeenCalledWith(7, 'line-7');

    fireEvent.click(screen.getByRole('button', { name: /Add more items/ }));
    expect(baseProps.goStoreCatalogPage).toHaveBeenCalledTimes(1);
    expect(baseProps.setIsCheckoutOpen).toHaveBeenCalledWith(false);

    fireEvent.click(screen.getByRole('button', { name: 'Continue to booking' }));
    expect(baseProps.handleServicesCartCheckout).toHaveBeenCalledTimes(1);
  });

  it('shows the floating cart button only while the drawer is closed', () => {
    render(<ServiceCartDrawer {...baseProps} isCheckoutOpen={false} />);

    expect(document.querySelector('[data-service-cart-fab="true"]')?.style.display).toBe('grid');
  });

  it('uses a bottom-up drawer transition on mobile and keeps the side transition on desktop', () => {
    const { rerender } = render(<ServiceCartDrawer {...baseProps} isMobileViewport />);
    const drawer = document.querySelector('[data-service-cart-drawer="true"]');

    expect(drawer?.style.top).toBe('auto');
    expect(drawer?.style.height).toBe('100dvh');
    expect(drawer?.style.transform).toBe('translateY(0)');

    rerender(<ServiceCartDrawer {...baseProps} isMobileViewport isCheckoutOpen={false} />);
    expect(document.querySelector('[data-service-cart-drawer="true"]')?.style.transform).toBe('translateY(104%)');

    rerender(<ServiceCartDrawer {...baseProps} isMobileViewport={false} />);
    expect(document.querySelector('[data-service-cart-drawer="true"]')?.style.transform).toBe('translateX(0)');
  });

  it('centers the mobile drawer handle across the full sheet header', () => {
    render(<ServiceCartDrawer {...baseProps} isMobileViewport />);

    const header = document.querySelector('[data-service-cart-drawer="true"] header');
    const handle = screen.getByTestId('service-cart-mobile-handle');

    expect(header?.style.display).toBe('grid');
    expect(header?.style.gridTemplateColumns).toBe('minmax(0, 1fr) auto');
    expect(handle.parentElement).toBe(header);
    expect(handle.style.gridColumn).toBe('1 / -1');
    expect(handle.style.justifySelf).toBe('center');
  });

  it('compacts the mobile footer while the quantity field is being edited', () => {
    render(<ServiceCartDrawer {...baseProps} isMobileViewport />);

    const footer = document.querySelector('[data-service-cart-drawer="true"] footer');
    const quantityInput = screen.getByRole('spinbutton', { name: 'Quantity for Comforter Care' });

    expect(footer?.style.gap).toBe('12px');
    expect(footer?.style.paddingTop).toBe('14px');

    fireEvent.focus(quantityInput);
    expect(footer?.style.gap).toBe('8px');
    expect(footer?.style.paddingTop).toBe('8px');
    expect(footer?.style.paddingBottom).toBe('8px');

    fireEvent.blur(quantityInput);
    expect(footer?.style.gap).toBe('12px');
    expect(footer?.style.paddingTop).toBe('14px');
  });

  it('keeps the empty mobile cart panel clear of the header divider', () => {
    render(<ServiceCartDrawer {...baseProps} isMobileViewport serviceCartLines={[]} serviceCartCount={0} serviceCartTotal={0} hasServiceCart={false} />);

    const lines = document.querySelector('[data-service-cart-lines="true"]');

    expect(lines?.style.padding).toBe('12px 16px');
    expect(screen.getByText('No service added yet')).toBeTruthy();
  });
});
