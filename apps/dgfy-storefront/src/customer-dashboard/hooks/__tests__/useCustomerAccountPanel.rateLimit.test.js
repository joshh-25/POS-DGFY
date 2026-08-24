/** @vitest-environment jsdom */
import { describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useCustomerAccountPanel } from '../useCustomerAccountPanel.js';

const buildProps = (overrides = {}) => ({
  EMPTY_ACCOUNT_PANEL: { loading: false, error: '', me: null, memberships: [], activities: [], orders: [], bookings: [], notifications: [], unreadNotificationCount: 0, addresses: [], loyalty: null, businessCompanies: [], businessStepUp: { verified: false } },
  selectedStore: null,
  knownStoreRouteCandidates: [],
  isDgfyCustomerSignedIn: true,
  dgfySessionAccount: { id: 'account-1' },
  setDgfySessionAccount: vi.fn(),
  setDgfyAuthTokenState: vi.fn(),
  requestJson: vi.fn(),
  normalizeStorefrontErrorMessage: (error, fallback) => error?.message || fallback,
  deriveAccountActivityCollections: () => ({ activities: [], orders: [], bookings: [] }),
  readDgfyAuthToken: () => 'dgfy-token',
  readStoreAuthToken: () => '',
  clearDgfyAuthToken: vi.fn(),
  ...overrides
});

// #958/#509: a 429 must surface retryAfterSeconds from handleLoadAccountPanel's
// return value (not just the panel's error string) so a caller polling on an
// interval -- useCustomerDashboardLiveSync -- can back off instead of
// re-arming its own lockout at the normal cadence.
describe('useCustomerAccountPanel rate-limit surfacing', () => {
  it('returns retryAfterSeconds when loadDgfyPanel is rate-limited', async () => {
    const rateLimitError = Object.assign(new Error('Too many requests'), {
      status: 429,
      retryAfterSeconds: 274
    });
    const requestJson = vi.fn().mockRejectedValue(rateLimitError);
    const props = buildProps({ requestJson });
    const { result } = renderHook(() => useCustomerAccountPanel(props));

    let returned;
    await waitFor(async () => { returned = await result.current.handleLoadAccountPanel({ silent: true }); });

    expect(returned).toEqual({ retryAfterSeconds: 274 });
    expect(result.current.accountPanel.error).toBeTruthy();
  });

  it('returns undefined on a normal error (not a 429)', async () => {
    const requestJson = vi.fn().mockRejectedValue(Object.assign(new Error('Server error'), { status: 500 }));
    const props = buildProps({ requestJson });
    const { result } = renderHook(() => useCustomerAccountPanel(props));

    let returned;
    await waitFor(async () => { returned = await result.current.handleLoadAccountPanel({ silent: true }); });

    expect(returned).toBeUndefined();
  });
});
