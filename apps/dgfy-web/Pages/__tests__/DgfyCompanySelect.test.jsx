/** @vitest-environment jsdom */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

const dgfyAuthMock = vi.hoisted(() => ({
  acceptDgfyInvitation: vi.fn(),
  exchangeDgfyHandoff: vi.fn(),
  fetchDgfyMe: vi.fn(),
  getStoredDgfyToken: vi.fn(() => 'dgfy-token'),
  listDgfyAccountCompanies: vi.fn(),
  logoutDgfyAccount: vi.fn(),
  startDgfyTenantSession: vi.fn()
}));

vi.mock('../../src/services/dgfyAuthService.js', () => dgfyAuthMock);

import DgfyCompanySelect from '../DgfyCompanySelect.jsx';

const ownedCompany = (overrides = {}) => ({
  membership_id: 1,
  tenant_id: 'tenant-1',
  company_name: 'Ada Bakes',
  role: 'staff',
  is_owner: true,
  can_switch: true,
  requires_action: null,
  tenant_status: 'active',
  ...overrides
});

// DgfyCompanySelect reads the handoff/next/tenant_id params off the real
// `window.location` (not React Router's location) so it can strip
// `handoff_token` via `history.replaceState` regardless of which router
// hosts it - same pattern as
// apps/store/src/shared/hooks/useStorefrontSession.js. MemoryRouter keeps
// its own virtual history, so the real window location has to be pushed to
// match before each render, same as discoveryHeaderAccount.integration.test.jsx.
const renderRoutes = (initialEntries = ['/dgfy/companies']) => {
  window.history.pushState({}, '', initialEntries[0]);
  return render(
    <MemoryRouter initialEntries={initialEntries}>
      <Routes>
        <Route path="/dgfy/companies" element={<DgfyCompanySelect />} />
        <Route path="/dgfy/auth" element={<div>DGFY sign-in screen</div>} />
        <Route path="/items" element={<div>Items screen</div>} />
        <Route path="/register-company" element={<div>Register company screen</div>} />
      </Routes>
    </MemoryRouter>
  );
};

beforeEach(() => {
  Object.values(dgfyAuthMock).forEach((mockFn) => mockFn.mockReset());
  dgfyAuthMock.getStoredDgfyToken.mockReturnValue('dgfy-token');
  dgfyAuthMock.fetchDgfyMe.mockResolvedValue({ account: { id: 'dgfy-1' } });
  dgfyAuthMock.startDgfyTenantSession.mockResolvedValue({ token: 'tenant-token', company: { id: 'tenant-1', token: 'company-token-1' } });
});

afterEach(() => {
  cleanup();
  window.history.replaceState({}, '', '/');
});

describe('DgfyCompanySelect', () => {
  it('bounces to /dgfy/auth when there is no DGFY session', async () => {
    dgfyAuthMock.fetchDgfyMe.mockRejectedValue({ response: { status: 401 } });
    dgfyAuthMock.getStoredDgfyToken.mockReturnValue('');

    renderRoutes(['/dgfy/companies']);

    expect(await screen.findByText('DGFY sign-in screen')).toBeTruthy();
    expect(dgfyAuthMock.listDgfyAccountCompanies).not.toHaveBeenCalled();
  });

  it('soft-fails an expired/consumed handoff token into /dgfy/auth rather than crashing', async () => {
    dgfyAuthMock.exchangeDgfyHandoff.mockResolvedValue({ status: 'invalid', reason: 'expired_or_consumed' });
    dgfyAuthMock.fetchDgfyMe.mockRejectedValue({ response: { status: 401 } });
    dgfyAuthMock.getStoredDgfyToken.mockReturnValue('');

    renderRoutes(['/dgfy/companies?handoff_token=expired-token']);

    expect(await screen.findByText('DGFY sign-in screen')).toBeTruthy();
    expect(dgfyAuthMock.exchangeDgfyHandoff).toHaveBeenCalledWith('expired-token', { softFail: true });
  });

  it('exchanges and strips a valid handoff token from the URL before rendering the picker', async () => {
    dgfyAuthMock.exchangeDgfyHandoff.mockResolvedValue({ token: 'dgfy-token', account: { id: 'dgfy-1' } });
    dgfyAuthMock.listDgfyAccountCompanies.mockResolvedValue({ companies: [ownedCompany(), ownedCompany({ membership_id: 2, tenant_id: 'tenant-2', company_name: 'Beta Store' })] });

    renderRoutes(['/dgfy/companies?handoff_token=fresh-token&next=%2Fitems']);

    await waitFor(() => expect(dgfyAuthMock.exchangeDgfyHandoff).toHaveBeenCalledWith('fresh-token', { softFail: true }));
    await screen.findByText('Ada Bakes');
    expect(window.location.search).not.toContain('handoff_token');
  });

  it('auto-selects and starts a tenant session when exactly one company is switchable', async () => {
    dgfyAuthMock.listDgfyAccountCompanies.mockResolvedValue({ companies: [ownedCompany()] });

    renderRoutes(['/dgfy/companies?next=%2Fitems']);

    await waitFor(() => expect(dgfyAuthMock.startDgfyTenantSession).toHaveBeenCalledWith({ tenantId: 'tenant-1' }));
    expect(await screen.findByText('Items screen')).toBeTruthy();
  });

  it('renders a picker when more than one company is switchable, and starts a session on selection', async () => {
    dgfyAuthMock.listDgfyAccountCompanies.mockResolvedValue({
      companies: [
        ownedCompany(),
        ownedCompany({ membership_id: 2, tenant_id: 'tenant-2', company_name: 'Beta Store', is_owner: false, role: 'manager' })
      ]
    });

    renderRoutes(['/dgfy/companies?next=%2Fitems']);

    await screen.findByText('Ada Bakes');
    expect(screen.getByText('Beta Store')).toBeTruthy();
    expect(dgfyAuthMock.startDgfyTenantSession).not.toHaveBeenCalled();

    screen.getByText('Beta Store').closest('button').click();

    await waitFor(() => expect(dgfyAuthMock.startDgfyTenantSession).toHaveBeenCalledWith({ tenantId: 'tenant-2' }));
    expect(await screen.findByText('Items screen')).toBeTruthy();
  });

  it('picks the tenant named by a ?tenant_id hint even when more than one company is switchable', async () => {
    dgfyAuthMock.listDgfyAccountCompanies.mockResolvedValue({
      companies: [
        ownedCompany(),
        ownedCompany({ membership_id: 2, tenant_id: 'tenant-2', company_name: 'Beta Store' })
      ]
    });

    renderRoutes(['/dgfy/companies?tenant_id=tenant-2&next=%2Fitems']);

    await waitFor(() => expect(dgfyAuthMock.startDgfyTenantSession).toHaveBeenCalledWith({ tenantId: 'tenant-2' }));
    expect(await screen.findByText('Items screen')).toBeTruthy();
  });

  it('shows an empty state with a link to register a business when there are zero memberships', async () => {
    dgfyAuthMock.listDgfyAccountCompanies.mockResolvedValue({ companies: [] });

    renderRoutes(['/dgfy/companies']);

    expect(await screen.findByText(/isn.t linked to any business yet/i)).toBeTruthy();
    // Two links point there: the empty-state CTA and the standing footer link.
    expect(screen.getAllByRole('link', { name: /register a business/i }).length).toBeGreaterThan(0);
  });
});
