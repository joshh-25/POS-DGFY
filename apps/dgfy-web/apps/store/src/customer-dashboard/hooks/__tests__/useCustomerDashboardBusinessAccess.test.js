/** @vitest-environment jsdom */
import { beforeEach, describe, expect, it, vi } from 'vitest';
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
  createDgfyHandoff: vi.fn(),
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
