/** @vitest-environment jsdom */
import React from 'react';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, useLocation, useNavigate } from 'react-router-dom';
import TenantManager from '../../../Pages/TenantManager.jsx';

const mocks = vi.hoisted(() => {
  const writeMethodNames = [
    'updateTenant', 'updateTenantCapabilities', 'createTenant', 'deleteTenant', 'approveTenant',
    'rejectTenant', 'adminReactivateTenant', 'forceTenantNonCompliant', 'selectTenantComplianceMode',
    'upgradeTenantComplianceMode', 'updateTenantComplianceArtifactVerification',
    'updateTenantCompliancePeripheralVerification', 'acknowledgeTenantComplianceSecurityIncident',
    'resolveTenantComplianceSecurityIncident', 'updateComplianceFinalReviewDocumentReview',
    'applyTenantTemplate', 'updateTenantPosMetadata', 'createAdminProvisionedTenant',
    'createAdminProvisionedAccountAndTenant', 'retryTenantProvisioning', 'revokeTenantRegistrationUpload',
    'createTenantSettlementBatch', 'scheduleTenantSettlementBatch', 'cancelTenantSettlementBatch',
    'confirmTenantManualPayout', 'createTenantManualPayout', 'approveTenantRevenueAdjustment',
    'requestTenantRevenueAdjustment', 'resolveTenantRevenueReconciliation', 'reconcileTenantRevenueProviderFinancials',
    'runTenantRevenueInternalReconciliation'
  ];
  const writeMocks = Object.fromEntries(writeMethodNames.map((name) => [name, vi.fn()]));
  return {
    adminServiceMock: {
      getTenants: vi.fn(),
      listCompanyRegistrationDrafts: vi.fn(),
      listStoreTemplates: vi.fn(),
      getTenantRevenueDashboard: vi.fn(),
      listTenantRevenueTransactions: vi.fn(),
      listTenantSettlementBatches: vi.fn(),
      listTenantRevenueReconciliation: vi.fn(),
      listTenantRevenueFeePolicies: vi.fn(),
      listTenantRevenueAdjustments: vi.fn(),
      ...writeMocks
    },
    writeMocks,
    toastMock: { success: vi.fn(), error: vi.fn() }
  };
});

vi.mock('@/services/adminService', () => mocks.adminServiceMock);
vi.mock('sonner', () => ({ toast: mocks.toastMock }));

const directoryTenants = [
  {
    id: '550e8400-e29b-41d4-a716-446655440000',
    name: 'Kate Market',
    admin_email: 'kate@example.test',
    domain: 'kate-market.test',
    company_token: 'tok-kate-secret',
    status: 'active',
    plan: 'standard',
    effective_plan: 'premium',
    compliance_mode_state: 'compliant_active',
    ownership_status: 'claimed',
    capabilities: { ims_enabled: true, pos_enabled: false, storefront_visible: true }
  },
  {
    id: 'tenant-pending-1',
    name: 'Nori House',
    admin_email: 'nori@example.test',
    domain: 'nori-house.test',
    status: 'pending',
    compliance_mode_choice_required: true,
    ownership_status: 'unassigned',
    capabilities: null
  },
  {
    id: 'tenant-inactive-1',
    name: 'Closed Shop',
    admin_email: 'closed@example.test',
    domain: 'closed-shop.test',
    status: 'inactive',
    plan: 'standard',
    ownership_status: 'handover_pending',
    capabilities: { unavailable: true }
  },
  {
    id: 'tenant-rejected-1',
    name: 'Rejected Foods',
    admin_email: 'reject@example.test',
    domain: 'rejected-foods.test',
    status: 'rejected',
    compliance_mode_state: 'non_compliant_active',
    ownership_status: 'unassigned',
    capabilities: null
  },
  {
    id: 'tenant-archived-1',
    name: 'Archived Foods',
    admin_email: 'archive@example.test',
    domain: 'archived-foods.test',
    status: 'archived',
    plan: 'standard',
    compliance_mode_state: 'compliant_pending',
    ownership_status: 'claimed',
    capabilities: null
  }
];

const LocationProbe = () => {
  const location = useLocation();
  return <output data-testid="location-search">{location.search}</output>;
};

const HistoryBackButton = () => {
  const navigate = useNavigate();
  return <button type="button" onClick={() => navigate(-1)}>Navigate back</button>;
};

const HistoryForwardButton = () => {
  const navigate = useNavigate();
  return <button type="button" onClick={() => navigate(1)}>Navigate forward</button>;
};

const renderDirectory = (initialEntry = '/admin/tenants') => render(
  <MemoryRouter initialEntries={[initialEntry]}>
    <LocationProbe />
    <HistoryBackButton />
    <HistoryForwardButton />
    <TenantManager />
  </MemoryRouter>
);

const waitForDirectory = async (count = '4 of 5') => {
  await screen.findByText(count);
};

describe('TenantManager searchable directory', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.adminServiceMock.getTenants.mockResolvedValue({ data: directoryTenants });
    mocks.adminServiceMock.listCompanyRegistrationDrafts.mockResolvedValue({ data: [] });
    mocks.adminServiceMock.listStoreTemplates.mockResolvedValue({ success: true, data: { templates: [] } });
    mocks.adminServiceMock.getTenantRevenueDashboard.mockResolvedValue({ data: null });
    mocks.adminServiceMock.listTenantRevenueTransactions.mockResolvedValue({ data: { transactions: [] } });
    mocks.adminServiceMock.listTenantSettlementBatches.mockResolvedValue({ data: { batches: [] } });
    mocks.adminServiceMock.listTenantRevenueReconciliation.mockResolvedValue({ data: { records: [] } });
    mocks.adminServiceMock.listTenantRevenueFeePolicies.mockResolvedValue({ data: { policies: [] } });
    mocks.adminServiceMock.listTenantRevenueAdjustments.mockResolvedValue({ data: { adjustments: [] } });
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it('loads all tenants once and combines search and every facet without requests or mutations', async () => {
    const user = userEvent.setup();
    renderDirectory();
    await waitForDirectory();
    expect(mocks.adminServiceMock.getTenants).toHaveBeenCalledTimes(1);
    expect(mocks.adminServiceMock.getTenants).toHaveBeenCalledWith('all');

    await user.type(screen.getByPlaceholderText('Search by name, admin email, domain, or tenant ID'), 'kate');
    await user.selectOptions(screen.getByLabelText('Status'), 'active');
    await user.selectOptions(screen.getByLabelText('Plan'), 'premium');
    await user.selectOptions(screen.getByLabelText('Compliance mode'), 'compliant_active');
    await user.selectOptions(screen.getByLabelText('Ownership'), 'claimed');
    await user.selectOptions(screen.getByLabelText('IMS capability'), 'on');
    await user.selectOptions(screen.getByLabelText('POS capability'), 'off');
    await user.selectOptions(screen.getByLabelText('Storefront capability'), 'on');

    expect(screen.getByRole('heading', { name: 'Kate Market' })).toBeTruthy();
    expect(screen.getByText('1 of 5')).toBeTruthy();
    expect(mocks.adminServiceMock.getTenants).toHaveBeenCalledTimes(1);
    Object.values(mocks.writeMocks).forEach((mock) => expect(mock).not.toHaveBeenCalled());
    expect(screen.getByTestId('location-search').textContent).toContain('q=kate');
    expect(screen.getByTestId('location-search').textContent).toContain('status=active');
    expect(screen.getByTestId('location-search').textContent).toContain('storefront=on');
  });

  it('keeps provisioning off the directory and preserves query context on Add tenant and Overview links', async () => {
    const search = '?q=Kate&status=active&plan=premium&compliance=compliant_active&ownership=claimed&ims=enabled&pos=disabled&storefront=visible&extra=keep';
    renderDirectory(`/admin/tenants${search}`);
    await screen.findByRole('heading', { name: 'Kate Market' });

    expect(screen.queryByText('Assisted provisioning')).toBeNull();
    expect(screen.queryByPlaceholderText('Company name')).toBeNull();
    expect(screen.getByRole('link', { name: 'Add tenant' }).getAttribute('href')).toBe(`/admin/tenants/new${search}`);
    expect(screen.getByRole('link', { name: 'Kate Market' }).getAttribute('href')).toBe(
      `/admin/tenants/550e8400-e29b-41d4-a716-446655440000${search}`
    );
  });

  it('hides archived by default, counts the whole set, and labels archived tenants', async () => {
    renderDirectory();
    await waitForDirectory();

    expect(screen.getByText('1 archived hidden')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Total tenants: 5' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Pending tenants: 1' })).toBeTruthy();
    expect(screen.queryByRole('heading', { name: 'Archived Foods' })).toBeNull();

    await userEvent.setup().click(screen.getByRole('button', { name: 'Show archived' }));
    expect(screen.getByTestId('location-search').textContent).toContain('status=archived');
    expect(await screen.findByRole('heading', { name: 'Archived Foods' })).toBeTruthy();
    const archivedCard = screen.getByRole('heading', { name: 'Archived Foods' }).closest('.bg-white');
    expect(within(archivedCard).getByText('Archived')).toBeTruthy();
    expect(screen.getByText('1 of 5')).toBeTruthy();
  });

  it('uses the identity-only search copy and does not match a company token', async () => {
    const user = userEvent.setup();
    renderDirectory();
    await waitForDirectory();
    expect(screen.getByText('Tenant search')).toBeTruthy();
    expect(screen.getByText('Matches company name, admin email, domain, or tenant ID.')).toBeTruthy();
    const search = screen.getByPlaceholderText('Search by name, admin email, domain, or tenant ID');

    await user.type(search, 'KATE@EXAMPLE.TEST');
    expect(screen.getByRole('heading', { name: 'Kate Market' })).toBeTruthy();
    await user.clear(search);
    await user.type(search, 'kate-market.test');
    expect(screen.getByRole('heading', { name: 'Kate Market' })).toBeTruthy();
    await user.clear(search);
    await user.type(search, '550e8400-e29b');
    expect(screen.getByRole('heading', { name: 'Kate Market' })).toBeTruthy();
    await user.clear(search);
    await user.type(search, 'tok-kate-secret');
    expect(screen.getByText('No tenants match these filters')).toBeTruthy();
  });

  it('preserves spaces while typing a multiword identity query', async () => {
    const user = userEvent.setup();
    renderDirectory();
    await waitForDirectory();
    const search = screen.getByPlaceholderText('Search by name, admin email, domain, or tenant ID');

    await user.type(search, 'Kate Market');

    expect(search.value).toBe('Kate Market');
    expect(screen.getByTestId('location-search').textContent).toBe('?q=Kate+Market');
    expect(screen.getByRole('heading', { name: 'Kate Market' })).toBeTruthy();
  });

  it('removes chips, clears all directory parameters, and restores URL state with browser back', async () => {
    const user = userEvent.setup();
    renderDirectory('/admin/tenants?q=kate&status=active');
    await screen.findByRole('heading', { name: 'Kate Market' });
    expect(screen.getByPlaceholderText('Search by name, admin email, domain, or tenant ID').value).toBe('kate');
    expect(screen.getByText('Search: kate')).toBeTruthy();

    await user.selectOptions(screen.getByLabelText('Status'), 'all');
    expect(await screen.findByText('1 of 5')).toBeTruthy();
    expect(screen.getByTestId('location-search').textContent).toContain('status=all');
    await user.click(screen.getByRole('button', { name: 'Navigate back' }));
    await screen.findByRole('heading', { name: 'Kate Market' });
    expect(screen.getByPlaceholderText('Search by name, admin email, domain, or tenant ID').value).toBe('kate');
    expect(screen.getByTestId('location-search').textContent).toContain('status=active');
    await user.click(screen.getByRole('button', { name: 'Navigate forward' }));
    expect(screen.getByTestId('location-search').textContent).toContain('status=all');
    await user.click(screen.getByRole('button', { name: 'Remove Status: All statuses' }));
    expect(screen.getByTestId('location-search').textContent).toContain('q=kate');
    expect(screen.getByTestId('location-search').textContent).not.toContain('status=');

    await user.click(screen.getByRole('button', { name: 'Clear all' }));
    expect(screen.getByTestId('location-search').textContent).toBe('');
    expect(screen.getByPlaceholderText('Search by name, admin email, domain, or tenant ID').value).toBe('');
    expect(screen.getByText('4 of 5')).toBeTruthy();
  });

  it('replaces URL history while typing and pushes facet changes for back and forward', async () => {
    const user = userEvent.setup();
    renderDirectory();
    await waitForDirectory();

    await user.type(screen.getByPlaceholderText('Search by name, admin email, domain, or tenant ID'), 'kate');
    expect(screen.getByTestId('location-search').textContent).toBe('?q=kate');
    await user.selectOptions(screen.getByLabelText('Status'), 'active');
    expect(screen.getByTestId('location-search').textContent).toBe('?q=kate&status=active');

    await user.click(screen.getByRole('button', { name: 'Navigate back' }));
    expect(screen.getByTestId('location-search').textContent).toBe('?q=kate');
    expect(screen.getByPlaceholderText('Search by name, admin email, domain, or tenant ID').value).toBe('kate');
    await user.click(screen.getByRole('button', { name: 'Navigate forward' }));
    expect(screen.getByTestId('location-search').textContent).toBe('?q=kate&status=active');
  });

  it('distinguishes initial loading, initial error with retry, refresh error, empty, and no-match states', async () => {
    let resolveInitial;
    mocks.adminServiceMock.getTenants.mockReturnValueOnce(new Promise((resolve) => { resolveInitial = resolve; }));
    const loadingView = renderDirectory();
    expect(screen.getByText('Loading tenants...')).toBeTruthy();
    expect(screen.queryByText('No tenants exist yet')).toBeNull();
    await act(async () => resolveInitial({ data: directoryTenants }));
    await waitForDirectory();
    loadingView.unmount();

    mocks.adminServiceMock.getTenants.mockRejectedValueOnce(new Error('offline'));
    renderDirectory();
    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(screen.getByText('Failed to load tenants')).toBeTruthy();
    expect(screen.queryByText('No tenants exist yet')).toBeNull();
    mocks.adminServiceMock.getTenants.mockResolvedValueOnce({ data: directoryTenants });
    await userEvent.setup().click(screen.getByRole('button', { name: 'Retry' }));
    await screen.findByRole('heading', { name: 'Kate Market' });
    cleanup();

    renderDirectory();
    await waitForDirectory();
    mocks.adminServiceMock.getTenants.mockRejectedValueOnce(new Error('refresh failed'));
    const header = screen.getByRole('heading', { name: 'Tenant Management' }).closest('div.bg-white');
    await userEvent.setup().click(within(header).getByRole('button', { name: 'Refresh' }));
    expect(await screen.findByText("Couldn't refresh tenants. Showing the last loaded list.")).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Kate Market' })).toBeTruthy();
    cleanup();

    mocks.adminServiceMock.getTenants.mockResolvedValueOnce({ data: [] });
    renderDirectory();
    expect(await screen.findByText('No tenants exist yet')).toBeTruthy();
    cleanup();

    renderDirectory('/admin/tenants?q=not-found');
    expect(await screen.findByText('No tenants match these filters')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Clear filters' })).toBeTruthy();
  }, 15000);

  it('keeps search state through refresh and silent provisioning polling', async () => {
    vi.useFakeTimers();
    const inProgress = {
      ...directoryTenants[0],
      registrationApplication: { provisioning_status: 'in_progress' }
    };
    mocks.adminServiceMock.getTenants.mockResolvedValue({ data: [inProgress, ...directoryTenants.slice(1)] });
    renderDirectory('/admin/tenants?q=kate&status=active');
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(screen.getByRole('heading', { name: 'Kate Market' })).toBeTruthy();
    expect(screen.getByTestId('location-search').textContent).toContain('q=kate');

    const header = screen.getByRole('heading', { name: 'Tenant Management' }).closest('div.bg-white');
    await act(async () => {
      fireEvent.click(within(header).getByRole('button', { name: 'Refresh' }));
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(mocks.adminServiceMock.getTenants).toHaveBeenCalledTimes(2);
    expect(screen.getByTestId('location-search').textContent).toContain('status=active');
    expect(screen.getByRole('heading', { name: 'Kate Market' })).toBeTruthy();

    await act(async () => {
      vi.advanceTimersByTime(3000);
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(mocks.adminServiceMock.getTenants).toHaveBeenCalledTimes(3);
    expect(screen.getByPlaceholderText('Search by name, admin email, domain, or tenant ID').value).toBe('kate');
    expect(screen.getByTestId('location-search').textContent).toContain('status=active');
    expect(screen.queryByText('Loading tenants...')).toBeNull();
  });
});
