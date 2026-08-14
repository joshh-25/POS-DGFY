/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { toast } from 'sonner';
import { useCustomerDashboardBusinessAccess } from '../useCustomerDashboardBusinessAccess.js';

vi.mock('sonner', () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn()
  }
}));

const buildDeps = (overrides = {}) => ({
  handleLoadAccountPanel: vi.fn(),
  requestJson: vi.fn(),
  readDgfyAuthToken: vi.fn(() => 'dgfy-token'),
  buildSkupervisorHandoffUrl: vi.fn(({ tenantId, next, handoffToken }) => (
    `https://skupervisor.dgfy.ph/dgfy/companies?tenant_id=${tenantId}&next=${encodeURIComponent(next)}${handoffToken ? `&handoff_token=${handoffToken}` : ''}`
  )),
  buildPosDgfyHandoffUrl: vi.fn(({ tenantId, next, handoffToken }) => (
    `https://pos.dgfy.ph/#/dgfy/companies?tenant_id=${tenantId}&next=${encodeURIComponent(next)}${handoffToken ? `&handoff_token=${handoffToken}` : ''}`
  )),
  createDgfyHandoff: vi.fn(),
  startDgfyTenantSession: vi.fn(),
  buildPosAppUrl: vi.fn(() => 'https://pos.dgfy.ph/'),
  dgfySessionAccount: { id: 'dgfy-1' },
  normalizeStorefrontErrorMessage: vi.fn((_error, fallback) => fallback),
  ...overrides
});

const originalLocation = window.location;

beforeEach(() => {
  vi.clearAllMocks();
  Object.defineProperty(window, 'location', {
    configurable: true,
    writable: true,
    value: { ...originalLocation, href: '' }
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

// Locks in the fix for the "Open business inventory" dead end: starting a
// tenant session on dgfy.ph's own origin (the old code) set cookies that the
// cross-origin jump to SKUpervisor then discarded, landing the user on
// SKUpervisor's staff login instead of their business. The fix mints a
// single-use handoff token instead and lets SKUpervisor start its own
// tenant session on its own origin.
describe('useCustomerDashboardBusinessAccess handleOpenBusinessInventory', () => {
  it('mints a handoff token and redirects through SKUpervisor with it, without starting a tenant session on this origin', async () => {
    const deps = buildDeps();
    deps.createDgfyHandoff.mockResolvedValue({ handoff_token: 'handoff-abc' });
    const { result } = renderHook(() => useCustomerDashboardBusinessAccess(deps));

    await result.current.handleOpenBusinessInventory({
      tenant_id: 'tenant-1',
      company: { id: 'tenant-1' }
    });

    await waitFor(() => expect(deps.createDgfyHandoff).toHaveBeenCalledWith('dgfy-token'));
    expect(deps.buildSkupervisorHandoffUrl).toHaveBeenCalledWith({
      tenantId: 'tenant-1',
      next: '/items',
      handoffToken: 'handoff-abc'
    });
    expect(window.location.href).toBe('https://skupervisor.dgfy.ph/dgfy/companies?tenant_id=tenant-1&next=%2Fitems&handoff_token=handoff-abc');
  });

  it('degrades to a tokenless redirect (does not dead-end) when minting the handoff fails', async () => {
    const deps = buildDeps();
    deps.createDgfyHandoff.mockRejectedValue(new Error('network error'));
    const { result } = renderHook(() => useCustomerDashboardBusinessAccess(deps));

    await result.current.handleOpenBusinessInventory({
      tenant_id: 'tenant-1',
      company: { id: 'tenant-1' }
    });

    await waitFor(() => expect(deps.buildSkupervisorHandoffUrl).toHaveBeenCalledWith({
      tenantId: 'tenant-1',
      next: '/items',
      handoffToken: ''
    }));
    expect(window.location.href).toBe('https://skupervisor.dgfy.ph/dgfy/companies?tenant_id=tenant-1&next=%2Fitems');
    expect(toast.error).not.toHaveBeenCalled();
  });

  it('shows an error and never redirects when neither a tenant id nor a company id is available', async () => {
    const deps = buildDeps();
    const { result } = renderHook(() => useCustomerDashboardBusinessAccess(deps));

    await result.current.handleOpenBusinessInventory({ company: {} });

    expect(toast.error).toHaveBeenCalledWith('Business session details are unavailable.');
    expect(deps.createDgfyHandoff).not.toHaveBeenCalled();
    expect(window.location.href).toBe('');
  });
});

describe('useCustomerDashboardBusinessAccess handleOpenBusinessPos', () => {
  it('mints a single-use handoff and opens the selected business POS without a second login', async () => {
    const deps = buildDeps();
    deps.createDgfyHandoff.mockResolvedValue({ handoff_token: 'handoff-pos' });
    const { result } = renderHook(() => useCustomerDashboardBusinessAccess(deps));

    await result.current.handleOpenBusinessPos({
      tenant_id: 'tenant-pos',
      company: { id: 'tenant-pos' }
    });

    await waitFor(() => expect(deps.createDgfyHandoff).toHaveBeenCalledWith('dgfy-token'));
    expect(deps.buildPosDgfyHandoffUrl).toHaveBeenCalledWith({
      tenantId: 'tenant-pos',
      next: '/terminal',
      handoffToken: 'handoff-pos'
    });
    expect(window.location.href).toBe('https://pos.dgfy.ph/#/dgfy/companies?tenant_id=tenant-pos&next=%2Fterminal&handoff_token=handoff-pos');
  });

  it('does not route Day Close PIN setup through POS', async () => {
    const deps = buildDeps();
    deps.requestJson.mockResolvedValue({ configured: true });
    const { result } = renderHook(() => useCustomerDashboardBusinessAccess(deps));

    await result.current.configureOwnBusinessDayClosePin(
      { tenant_id: 'tenant-pos' },
      { currentPassword: 'current-password', pin: '1234' }
    );

    expect(deps.startDgfyTenantSession).not.toHaveBeenCalled();
    expect(deps.requestJson).toHaveBeenCalledWith('/api/v1/dgfy/account/companies/tenant-pos/pos-day-close-pin', {
      method: 'PUT',
      authToken: 'dgfy-token',
      body: { current_password: 'current-password', pin: '1234' },
      cache: 'no-store'
    });
    expect(deps.buildPosDgfyHandoffUrl).not.toHaveBeenCalled();
    expect(window.location.href).toBe('');
  });

  it('keeps Storefront in place and reports an error when the POS handoff token cannot be minted', async () => {
    const deps = buildDeps();
    deps.createDgfyHandoff.mockRejectedValue(new Error('network error'));
    const { result } = renderHook(() => useCustomerDashboardBusinessAccess(deps));

    await result.current.handleOpenBusinessPos({ tenant_id: 'tenant-pos' });

    expect(deps.buildPosDgfyHandoffUrl).not.toHaveBeenCalled();
    expect(window.location.href).toBe('');
    expect(toast.error).toHaveBeenCalledWith('Unable to open the business POS right now.');
  });

  it('does not navigate when the handoff response lacks its one-time token', async () => {
    const deps = buildDeps();
    deps.createDgfyHandoff.mockResolvedValue({ handoff_token: '' });
    const { result } = renderHook(() => useCustomerDashboardBusinessAccess(deps));

    await result.current.handleOpenBusinessPos({ tenant_id: 'tenant-pos' });

    expect(deps.buildPosDgfyHandoffUrl).not.toHaveBeenCalled();
    expect(window.location.href).toBe('');
    expect(toast.error).toHaveBeenCalledWith('Unable to open the business POS right now.');
  });

  it('opens a new tab synchronously and sends the handoff only to that tab', async () => {
    const deps = buildDeps();
    const targetWindow = {
      closed: false,
      opener: window,
      location: { replace: vi.fn() },
      close: vi.fn()
    };
    vi.spyOn(window, 'open').mockReturnValue(targetWindow);
    deps.createDgfyHandoff.mockResolvedValue({ handoff_token: 'handoff-new-tab' });
    const { result } = renderHook(() => useCustomerDashboardBusinessAccess(deps));

    await result.current.handleOpenBusinessPos({ tenant_id: 'tenant-pos' }, { openInNewTab: true });

    expect(window.open).toHaveBeenCalledWith('', '_blank');
    expect(targetWindow.opener).toBeNull();
    expect(targetWindow.location.replace).toHaveBeenCalledWith(
      'https://pos.dgfy.ph/#/dgfy/companies?tenant_id=tenant-pos&next=%2Fterminal&handoff_token=handoff-new-tab'
    );
    expect(window.location.href).toBe('');
  });

  it('keeps Storefront in place when the browser blocks the new POS tab', async () => {
    const deps = buildDeps();
    vi.spyOn(window, 'open').mockReturnValue(null);
    const { result } = renderHook(() => useCustomerDashboardBusinessAccess(deps));

    await result.current.handleOpenBusinessPos({ tenant_id: 'tenant-pos' }, { openInNewTab: true });

    expect(deps.createDgfyHandoff).not.toHaveBeenCalled();
    expect(window.location.href).toBe('');
    expect(toast.error).toHaveBeenCalledWith('Your browser blocked the POS tab. Allow pop-ups for DGFY, then try again.');
  });

  it('closes the blank POS tab instead of navigating it without a secure handoff token', async () => {
    const deps = buildDeps();
    const targetWindow = {
      closed: false,
      opener: window,
      location: { replace: vi.fn() },
      close: vi.fn()
    };
    vi.spyOn(window, 'open').mockReturnValue(targetWindow);
    deps.createDgfyHandoff.mockRejectedValue(new Error('network error'));
    const { result } = renderHook(() => useCustomerDashboardBusinessAccess(deps));

    await result.current.handleOpenBusinessPos({ tenant_id: 'tenant-pos' }, { openInNewTab: true });

    expect(targetWindow.location.replace).not.toHaveBeenCalled();
    expect(targetWindow.close).toHaveBeenCalledTimes(1);
    expect(toast.error).toHaveBeenCalledWith('Unable to open the business POS right now.');
  });
});

describe('useCustomerDashboardBusinessAccess switchDgfyCompanyFromStorefront', () => {
  it('calls the OTP-gated switch endpoint, then redirects through SKUpervisor with a handoff token', async () => {
    const deps = buildDeps();
    deps.createDgfyHandoff.mockResolvedValue({ handoff_token: 'handoff-xyz' });
    const { result } = renderHook(() => useCustomerDashboardBusinessAccess(deps));

    await result.current.switchDgfyCompanyFromStorefront({ tenantId: 'tenant-2', emailOtpCode: '123456' });

    expect(deps.requestJson).toHaveBeenCalledWith(
      '/api/v1/dgfy/account/companies/tenant-2/switch',
      expect.objectContaining({ method: 'POST', authToken: 'dgfy-token', body: { email_otp_code: '123456' } })
    );
    expect(deps.buildSkupervisorHandoffUrl).toHaveBeenCalledWith({
      tenantId: 'tenant-2',
      next: '/items',
      handoffToken: 'handoff-xyz'
    });
    expect(window.location.href).toContain('tenant_id=tenant-2');
  });
});
