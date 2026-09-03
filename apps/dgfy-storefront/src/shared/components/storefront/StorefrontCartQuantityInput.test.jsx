/** @vitest-environment jsdom */
import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { StorefrontCartQuantityInput } from './StorefrontCartQuantityInput.jsx';

const baseProps = {
  itemId: 17,
  lineName: 'Sample product',
  cartLineId: 'cart-line-17',
  quantity: 4,
  onUpdateQuantity: vi.fn()
};

describe('StorefrontCartQuantityInput', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('accepts a direct numeric quantity and commits the exact cart line on Enter', () => {
    render(<StorefrontCartQuantityInput {...baseProps} />);

    const input = screen.getByRole('spinbutton', { name: 'Quantity for Sample product' });
    expect(input.type).toBe('text');
    expect(input.inputMode).toBe('numeric');
    expect(input.pattern).toBe('[0-9]*');
    expect(input.getAttribute('aria-valuemin')).toBe('1');
    expect(input.getAttribute('aria-valuenow')).toBe('4');
    expect(input.style.fontSize).toBe('16px');

    fireEvent.focus(input);
    expect(input.selectionStart).toBe(0);
    expect(input.selectionEnd).toBe(1);
    fireEvent.change(input, { target: { value: '12' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(baseProps.onUpdateQuantity).toHaveBeenCalledWith(17, 12, 'cart-line-17');
  });

  it('filters non-numeric text and restores an empty draft without mutating the cart', () => {
    render(<StorefrontCartQuantityInput {...baseProps} />);

    const input = screen.getByRole('spinbutton', { name: 'Quantity for Sample product' });
    fireEvent.change(input, { target: { value: '12abc' } });
    expect(input.value).toBe('12');
    fireEvent.change(input, { target: { value: '' } });
    fireEvent.blur(input);

    expect(input.value).toBe('4');
    expect(baseProps.onUpdateQuantity).not.toHaveBeenCalled();
  });
});
