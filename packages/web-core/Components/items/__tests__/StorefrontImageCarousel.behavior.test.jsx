// @vitest-environment jsdom
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import StorefrontImageCarousel from '../StorefrontImageCarousel.jsx';

afterEach(cleanup);

const gallery = [
  { url: '/uploads/items/primary.webp' },
  { url: '/uploads/items/alternate.webp' }
];

describe('StorefrontImageCarousel primary toggle', () => {
  it('promotes the focused image through the primary toggle', async () => {
    const user = userEvent.setup();
    const onSetPrimary = vi.fn();

    render(
      <StorefrontImageCarousel
        gallery={gallery}
        itemName="Blue Drink"
        showPrimaryToggle
        onSetPrimary={onSetPrimary}
        onRemove={vi.fn()}
      />
    );

    const primaryToggle = screen.getByRole('switch', { name: 'Make item image 1 primary' });
    expect(primaryToggle.getAttribute('aria-checked')).toBe('true');
    expect(primaryToggle.hasAttribute('disabled')).toBe(true);

    await user.click(screen.getByRole('button', { name: 'Next item image' }));
    const alternateToggle = screen.getByRole('switch', { name: 'Make item image 2 primary' });
    expect(alternateToggle.getAttribute('aria-checked')).toBe('false');

    await user.click(alternateToggle);

    expect(onSetPrimary).toHaveBeenCalledWith(1);
    expect(screen.getByRole('switch', { name: 'Make item image 1 primary' }).getAttribute('aria-checked')).toBe('true');
  });
});
