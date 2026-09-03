/** @vitest-environment jsdom */
import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { FnbCartDrawerContent } from '../modes/fnb/checkout/components/FnbCartDrawerContent.jsx';
import { SimpleCartLineItem } from '../modes/simple/checkout/components/SimpleCartLineItem.jsx';
import { DefaultProductCartLineItem } from '../shared/components/storefront/DefaultProductCartLineItem.jsx';

const line = {
  item_id: 22,
  cart_line_id: 'line-22',
  name: 'Cart item',
  quantity: 1,
  price: 25,
  unit_of_measure: 'pcs'
};

const assertTypedQuantity = (Component, props) => {
  const onUpdateQuantity = vi.fn();
  render(<Component {...props} onUpdateQuantity={onUpdateQuantity} />);

  const input = screen.getByRole('spinbutton', { name: 'Quantity for Cart item' });
  fireEvent.change(input, { target: { value: '6' } });
  fireEvent.keyDown(input, { key: 'Enter' });

  expect(onUpdateQuantity).toHaveBeenCalledWith(22, 6, 'line-22');
};

describe('product cart quantity editor mode integration', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('commits a typed quantity for Retail', () => {
    assertTypedQuantity(DefaultProductCartLineItem, {
      cartImageErrors: new Set(),
      line,
      money: (value) => `PHP ${value}`,
      onImageError: vi.fn(),
      onRemoveItem: vi.fn(),
      withAssetOrigin: (value) => value
    });
  });

  it('commits a typed quantity for Simple MSME', () => {
    assertTypedQuantity(SimpleCartLineItem, {
      cartImageErrors: new Set(),
      line,
      money: (value) => `PHP ${value}`,
      onImageError: vi.fn(),
      onRemoveItem: vi.fn(),
      servicesPrimary: '#176b3a'
    });
  });

  it('commits a typed quantity for F&B', () => {
    const updateQty = vi.fn();
    render(
      <FnbCartDrawerContent
        cart={[line]}
        cartAddOnsTotal={0}
        cartCount={1}
        cartImageErrors={new Set()}
        cartSubtotal={25}
        cartTotal={25}
        fnbOrderBrand="#f97316"
        getLineTotal={(cartLine) => cartLine.price * cartLine.quantity}
        goStoreCatalogPage={vi.fn()}
        goStoreOrderPage={vi.fn()}
        isDesktopCheckout
        isMobileViewport={false}
        money={(value) => `PHP ${value}`}
        onEditCartLine={vi.fn()}
        removeCartItem={vi.fn()}
        renderPromoCodePanel={() => null}
        servicesBodyFont="Segoe UI, sans-serif"
        setCartImageErrors={vi.fn()}
        setIsCheckoutOpen={vi.fn()}
        updateQty={updateQty}
      />
    );

    const input = screen.getByRole('spinbutton', { name: 'Quantity for Cart item' });
    fireEvent.change(input, { target: { value: '6' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(updateQty).toHaveBeenCalledWith(22, 6, 'line-22');
  });
});
