/** @vitest-environment jsdom */
import React from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { StorefrontHeaderNav } from '../Components/storefront/hero/StorefrontHeaderNav.jsx';

describe('StorefrontHeaderNav', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  const baseProps = {
    bodyFont: '"Source Sans 3", "Segoe UI", sans-serif',
    onBack: vi.fn(),
    onShop: vi.fn(),
    onTrack: vi.fn(),
    onAccount: vi.fn(),
    branchSelector: <button type="button">Space Bar Festive (2nd Floor)</button>,
    storefrontName: 'Space Bar',
    storefrontModeLabel: 'Food & Beverages',
    storefrontSlug: 'space-bar-2193ed',
    accountName: 'Gaille Dinji',
    accountInitials: 'GD',
    accountEmail: 'gaille@example.com',
    isAuthenticated: true
  };

  it('keeps mobile signed-in profile and hamburger menu as separate actions', async () => {
    const user = userEvent.setup();
    const onAccount = vi.fn();

    render(
      <StorefrontHeaderNav
        {...baseProps}
        isMobileViewport
        onAccount={onAccount}
      />
    );

    const profileButton = screen.getByRole('button', { name: 'Profile' });
    const menuButton = screen.getByRole('button', { name: 'Open navigation menu' });

    expect(profileButton).toBeTruthy();
    expect(menuButton).toBeTruthy();
    expect(screen.getByText('GD')).toBeTruthy();

    await user.click(profileButton);
    expect(onAccount).toHaveBeenCalledTimes(1);

    await user.click(menuButton);
    expect(screen.getByRole('dialog', { name: 'Mobile navigation' })).toBeTruthy();
  });

  it('shows initials without the first name in desktop signed-in storefront header', () => {
    render(
      <StorefrontHeaderNav
        {...baseProps}
        isMobileViewport={false}
      />
    );

    expect(screen.getByRole('button', { name: 'Profile' })).toBeTruthy();
    expect(screen.getByText('GD')).toBeTruthy();
    expect(screen.queryByText('Gaille')).toBeNull();
  });
});
