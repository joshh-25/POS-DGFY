/** @vitest-environment jsdom */

import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { StorefrontPromoSection } from './StorefrontPromoSection.jsx';

const promo = {
  title: 'August Promo',
  promoCode: 'SARAPCA',
  discountLabel: '20% OFF',
  subtitle: 'Save on your next order.',
  validityText: 'Valid until Aug 31'
};

const renderPromo = () => render(
  <StorefrontPromoSection
    items={[promo]}
    isMobileViewport={false}
    palette="fnb"
    titleFontFamily="Arial"
    bodyFontFamily="Arial"
  />
);

describe('StorefrontPromoSection promo card', () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('toggles the shared card between front and back without a Back button', () => {
    renderPromo();

    const card = screen.getByRole('button', { name: /show or hide promo code for august promo/i });

    expect(card.getAttribute('aria-pressed')).toBe('false');
    expect(screen.queryByRole('button', { name: /^back$/i })).toBeNull();

    fireEvent.click(card);
    expect(card.getAttribute('aria-pressed')).toBe('true');

    const backFace = screen.getByRole('region', { name: /august promo promo code/i });
    fireEvent.click(backFace);
    expect(card.getAttribute('aria-pressed')).toBe('false');

    fireEvent.click(card);
    fireEvent.keyDown(backFace, { key: 'Enter' });
    expect(card.getAttribute('aria-pressed')).toBe('false');
  });

  it('keeps copy action from toggling the card', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText }
    });
    renderPromo();

    const card = screen.getByRole('button', { name: /show or hide promo code for august promo/i });
    fireEvent.click(card);
    fireEvent.click(screen.getByRole('button', { name: /^copy$/i }));

    await waitFor(() => expect(writeText).toHaveBeenCalledWith('SARAPCA'));
    expect(card.getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByRole('button', { name: /copied/i })).toBeTruthy();
  });
});
