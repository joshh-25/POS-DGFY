// @vitest-environment jsdom
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import TerminalWorkspaceSidebar from '../components/TerminalWorkspaceSidebar.jsx';

afterEach(() => {
  cleanup();
});

describe('POS catalog-only access', () => {
  it('keeps item and category management available while hiding operational navigation', () => {
    render(
      <TerminalWorkspaceSidebar
        showBrand={false}
        isOnline
        canViewPos={false}
        canManageCategories
        catalogOnlyAccess
        onboardingRestricted={false}
        terminalUser={{ role: 'admin' }}
        currentViewMode="items"
        onSelectViewMode={vi.fn()}
      />
    );

    expect(screen.getByTestId('pos-catalog-only-banner').textContent).toMatch(/add items and categories/i);
    expect(screen.getByTestId('pos-nav-items').disabled).toBe(false);
    expect(screen.getByTestId('pos-nav-onboarding').disabled).toBe(true);
    expect(screen.getByTestId('pos-nav-sell').disabled).toBe(true);
    expect(screen.getByTestId('pos-nav-history').disabled).toBe(true);
    expect(screen.getByTestId('pos-nav-reports').disabled).toBe(true);
    expect(screen.queryByRole('button', { name: 'Settings' })).toBeNull();
    expect(screen.getByTestId('pos-nav-orders').disabled).toBe(true);
  });
});
