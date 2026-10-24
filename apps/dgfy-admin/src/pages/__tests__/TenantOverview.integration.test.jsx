/** @vitest-environment jsdom */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useNavigate } from 'react-router-dom';
import TenantOverview from '../../../Pages/TenantOverview.jsx';

const mocks = vi.hoisted(() => ({ getTenant: vi.fn() }));
vi.mock('@/services/adminService', () => ({ getTenant: mocks.getTenant }));

const sampleTenant = (changes = {}) => ({
  id: 'tenant-1',
  name: 'North Market',
  admin_email: 'ops@example.test',
  domain: 'north.example.test',
  status: 'active',
  effective_plan: 'premium',
  plan: 'standard',
  ownership_status: 'claimed',
  owner_dgfy_account_id: 'account-1',
  compliance_mode_state: 'compliant_active',
  compliance_policy_version: '2026.10',
  capabilities: { ims_enabled: true, pos_enabled: false, storefront_visible: true, downpayment_allowed: false },
  ...changes
});

const IdSwitcher = () => {
  const navigate = useNavigate();
  return <button type="button" onClick={() => navigate('/admin/tenants/tenant-2?status=active')}>Open second tenant</button>;
};

const renderOverview = (initialEntry = '/admin/tenants/tenant-1?status=active') => render(
  <MemoryRouter initialEntries={[initialEntry]}>
    <IdSwitcher />
    <Routes>
      <Route path="/admin/tenants/:id" element={<TenantOverview />} />
    </Routes>
  </MemoryRouter>
);

describe('TenantOverview', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getTenant.mockResolvedValue({ data: sampleTenant() });
  });

  afterEach(cleanup);

  it('fetches only the requested tenant and presents its safe overview directly', async () => {
    renderOverview('/admin/tenants/tenant-1?status=active&extra=keep');
    expect(await screen.findByRole('heading', { name: 'North Market' })).toBeTruthy();
    expect(mocks.getTenant).toHaveBeenCalledExactlyOnceWith('tenant-1');
    expect(screen.getByText('tenant-1')).toBeTruthy();
    expect(screen.getByText('ops@example.test')).toBeTruthy();
    expect(screen.getByText('north.example.test')).toBeTruthy();
    expect(screen.getByText('premium')).toBeTruthy();
    expect(screen.getByText('Claimed')).toBeTruthy();
    expect(screen.getByText('Compliant active')).toBeTruthy();
    expect(screen.getAllByText('Enabled').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Disabled').length).toBeGreaterThan(0);
    expect(screen.getByRole('link', { name: /Back to tenants/ }).getAttribute('href'))
      .toBe('/admin/tenants?status=active&extra=keep');
    expect(screen.queryByRole('link', { name: /compliance history|capability controls|ownership changes/i })).toBeNull();
  });

  it('shows a distinct not-found state and a retryable service failure', async () => {
    mocks.getTenant.mockRejectedValueOnce({ response: { status: 404 } });
    renderOverview('/admin/tenants/missing');
    expect(await screen.findByRole('heading', { name: 'Tenant not found' })).toBeTruthy();

    cleanup();
    mocks.getTenant.mockRejectedValueOnce(new Error('offline'));
    mocks.getTenant.mockResolvedValueOnce({ data: sampleTenant() });
    renderOverview('/admin/tenants/tenant-1');
    expect((await screen.findByRole('alert')).textContent).toContain('Retry the request');
    await userEvent.setup().click(screen.getByRole('button', { name: 'Retry' }));
    expect(await screen.findByRole('heading', { name: 'North Market' })).toBeTruthy();
    expect(mocks.getTenant).toHaveBeenCalledTimes(3);
  });

  it('clears stale tenant content when the route ID changes and ignores the old response', async () => {
    let resolveFirst;
    mocks.getTenant.mockReturnValueOnce(new Promise((resolve) => { resolveFirst = resolve; }));
    mocks.getTenant.mockResolvedValueOnce({ data: sampleTenant({ id: 'tenant-2', name: 'South Market' }) });
    const user = userEvent.setup();
    renderOverview('/admin/tenants/tenant-1');
    await user.click(screen.getByRole('button', { name: 'Open second tenant' }));
    expect(await screen.findByRole('heading', { name: 'South Market' })).toBeTruthy();

    await act(async () => resolveFirst({ data: sampleTenant({ name: 'Stale North Market' }) }));
    expect(screen.queryByText('Stale North Market')).toBeNull();
    expect(screen.getByRole('heading', { name: 'South Market' })).toBeTruthy();
  });

  it('marks archived tenant overview as read-only and does not infer missing capabilities as disabled', async () => {
    mocks.getTenant.mockResolvedValueOnce({ data: sampleTenant({
      status: 'archived',
      capabilities: { ims_enabled: true }
    }) });
    renderOverview('/admin/tenants/tenant-1');
    expect(await screen.findByText(/archived\. The overview is read-only/)).toBeTruthy();
    expect(screen.getAllByText('Not reported').length).toBeGreaterThan(0);
    expect(screen.queryByRole('button', { name: /enable|disable|archive|restore/i })).toBeNull();
  });
});
