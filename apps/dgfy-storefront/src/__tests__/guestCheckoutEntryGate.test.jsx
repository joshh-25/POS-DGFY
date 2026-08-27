// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { createCustomerIdentityRenderers } from '../features/checkout/renderers/customerIdentityRenderers.jsx';

// #622: the single UI seam every mode's guest-or-account entry gate goes through
// (RetailOrderAccountStep, SimpleCheckoutCustomerStep, SimpleCheckoutFulfillmentStep, the F&B
// route ViewModel) -- covering it here covers all four without duplicating the assertion per mode.
const buildRenderers = (overrides = {}) => createCustomerIdentityRenderers({
  openCheckoutAuthFlow: vi.fn(),
  setGuestCheckoutUnlocked: vi.fn(),
  ...overrides
});

describe('renderGuestCheckoutEntry (#622 per-store guest checkout toggle)', () => {
  afterEach(() => {
    cleanup();
  });

  it('offers "Continue as Guest" when the store has not disabled guest checkout', () => {
    const { renderGuestCheckoutEntry } = buildRenderers({ guestCheckoutAllowed: true });
    render(renderGuestCheckoutEntry());

    expect(screen.getByRole('button', { name: 'Continue as Guest' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Create DGFY Account' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Log in' })).toBeTruthy();
  });

  it('defaults to allowed when guestCheckoutAllowed is omitted (fail open)', () => {
    const { renderGuestCheckoutEntry } = buildRenderers();
    render(renderGuestCheckoutEntry());

    expect(screen.getByRole('button', { name: 'Continue as Guest' })).toBeTruthy();
  });

  it('hides "Continue as Guest" and swaps the copy when the store requires an account', () => {
    const { renderGuestCheckoutEntry } = buildRenderers({ guestCheckoutAllowed: false });
    render(renderGuestCheckoutEntry());

    expect(screen.queryByRole('button', { name: 'Continue as Guest' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Create DGFY Account' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Log in' })).toBeTruthy();
    expect(screen.getByText('This store requires a DGFY account to check out. Create one or log in to continue.')).toBeTruthy();
  });

  it('still lets a caller override the description explicitly when guest checkout is disabled', () => {
    const { renderGuestCheckoutEntry } = buildRenderers({ guestCheckoutAllowed: false });
    render(renderGuestCheckoutEntry({ description: 'Custom copy for this flow.' }));

    expect(screen.getByText('Custom copy for this flow.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Continue as Guest' })).toBeNull();
  });
});
