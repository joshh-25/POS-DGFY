/** @vitest-environment jsdom */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import TenantManager from '../../../../../apps/dgfy-ims/Pages/admin/TenantManager.jsx';

const mocks = vi.hoisted(() => ({
  adminServiceMock: {
    getTenants: vi.fn(),
    updateTenant: vi.fn(),
    updateTenantCapabilities: vi.fn(),
    listTenantCapabilityAuditLogs: vi.fn(),
    createTenant: vi.fn(),
    deleteTenant: vi.fn(),
    approveTenant: vi.fn(),
    rejectTenant: vi.fn(),
    adminReactivateTenant: vi.fn(),
    forceTenantNonCompliant: vi.fn(),
    selectTenantComplianceMode: vi.fn(),
    upgradeTenantComplianceMode: vi.fn(),
    listTenantComplianceArtifacts: vi.fn(),
    listTenantCompliancePeripherals: vi.fn(),
    getTenantComplianceChecklist: vi.fn(),
    listTenantComplianceAuditLogs: vi.fn(),
    listTenantComplianceSecurityIncidents: vi.fn(),
    updateTenantComplianceArtifactVerification: vi.fn(),
    updateTenantCompliancePeripheralVerification: vi.fn(),
    acknowledgeTenantComplianceSecurityIncident: vi.fn(),
    resolveTenantComplianceSecurityIncident: vi.fn(),
    updateComplianceFinalReviewDocumentReview: vi.fn(),
    listStoreTemplates: vi.fn(),
    getTenantRevenueDashboard: vi.fn(),
    listTenantRevenueTransactions: vi.fn(),
    listTenantSettlementBatches: vi.fn(),
    listTenantRevenueReconciliation: vi.fn(),
    listTenantRevenueFeePolicies: vi.fn(),
    listTenantRevenueAdjustments: vi.fn()
  },
  toastMock: {
    success: vi.fn(),
    error: vi.fn()
  }
}));

vi.mock('@/services/adminService', () => mocks.adminServiceMock);
vi.mock('sonner', () => ({ toast: mocks.toastMock }));

describe('TenantManager capability controls', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.adminServiceMock.getTenants.mockResolvedValue({
      data: [
        {
          id: 'tenant-kusina',
          name: 'Kusina & Cafe',
          admin_email: 'kusina@example.test',
          company_token: 'token-kusina',
          status: 'active',
          plan: 'premium',
          compliance_mode_state: 'non_compliant_active',
          compliance_mode_choice_required: false,
          can_force_non_compliant: false,
          force_non_compliant_block_reason: 'Tenant is already in non_compliant_active mode.',
          created_at: '2026-06-05T05:24:00.000Z',
          capabilities: {
            ims_enabled: true,
            pos_enabled: false,
            storefront_visible: true,
            customer_access_mode: 'transaction',
            requested_customer_access_mode: 'transaction',
            effective_customer_access_mode: 'catalog',
            max_customer_access_mode: 'catalog',
            platform_max_customer_access_mode: 'transaction',
            registration_stage_max_customer_access_mode: 'catalog',
            registration_stage: 'informal',
            customer_access_limitation_reason: 'Registration stage informal allows up to catalog mode.',
            access_capabilities: {
              cart: false,
              quote: false,
              checkout: false,
              booking: false
            }
          }
        },
        {
          id: 'tenant-kate',
          name: 'Kate Store',
          admin_email: 'kate@example.test',
          company_token: 'token-kate',
          status: 'active',
          plan: 'premium',
          capabilities: {
            ims_enabled: true,
            pos_enabled: true,
            storefront_visible: false,
            customer_access_mode: 'ghost'
          }
        }
      ]
    });
    mocks.adminServiceMock.updateTenantCapabilities.mockResolvedValue({ success: true });
    mocks.adminServiceMock.listTenantCapabilityAuditLogs.mockResolvedValue({
      data: {
        logs: [
          {
            id: 10,
            actor_username: 'skupervisor',
            reason: 'Tenant requested POS restoration',
            created_at: '2026-06-07T03:00:00.000Z',
            before_snapshot: {
              ims_enabled: true,
              pos_enabled: false,
              storefront_visible: true,
              customer_access_mode: 'catalog'
            },
            after_snapshot: {
              ims_enabled: true,
              pos_enabled: true,
              storefront_visible: true,
              customer_access_mode: 'catalog'
            }
          }
        ]
      }
    });
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
  });

  it('filters tenants by search and updates capability switches with an audit reason', async () => {
    const user = userEvent.setup();
    render(<MemoryRouter><TenantManager /></MemoryRouter>);

    await screen.findByRole('heading', { name: 'Kusina & Cafe' });
    expect(screen.getByText('Tenant search')).toBeTruthy();
    expect(screen.getByText('2 of 2')).toBeTruthy();
    await user.type(screen.getByPlaceholderText('Search tenants, tokens, plans, or capabilities'), 'kusina');

    expect(screen.getByRole('heading', { name: 'Kusina & Cafe' })).toBeTruthy();
    // Kate Store's own detail card is filtered out. The tenant-revenue
    // workspace's tenant picker is a separate, unfiltered widget that
    // legitimately keeps listing every tenant as a <select> option.
    expect(screen.queryByRole('heading', { name: 'Kate Store' })).toBeNull();
    expect(screen.getByText('1 of 2')).toBeTruthy();

    await user.click(screen.getByRole('button', { name: /POS Off/i }));
    await screen.findByText('Confirm capability change');
    expect(screen.getByText('Tenant impact preview')).toBeTruthy();
    expect(screen.getByText(/POS access will be restored for this company/)).toBeTruthy();
    await user.type(screen.getByLabelText('Reason'), 'Tenant requested POS restoration');
    await user.click(screen.getByRole('button', { name: /Apply change/i }));

    await waitFor(() => {
      expect(mocks.adminServiceMock.updateTenantCapabilities).toHaveBeenCalledWith(
        'tenant-kusina',
        { pos_enabled: true, reason: 'Tenant requested POS restoration' }
      );
    });
    expect(mocks.toastMock.success).toHaveBeenCalledWith('Tenant capabilities updated');
  }, 15000);

  it('shows storefront readiness gaps for visible tenants without a publishable pin', async () => {
    render(<MemoryRouter><TenantManager /></MemoryRouter>);

    await screen.findByRole('heading', { name: 'Kusina & Cafe' });
    expect(screen.getAllByRole('region', { name: 'Core workspace access' })).toHaveLength(2);
    expect(screen.getAllByRole('region', { name: 'Public storefront controls' })).toHaveLength(2);
    expect(screen.getByText('Needs primary map pin')).toBeTruthy();
    expect(screen.getAllByText('Storefront sub-modes')).toHaveLength(2);
    expect(screen.getByText('Requested: Online ordering mode')).toBeTruthy();
    expect(screen.getAllByText(/Effective: Catalog only \/ Max: Catalog only/i).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/Platform max: Online ordering mode \/ Registration max: Catalog only/i).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Platform max allowed')).toHaveLength(2);
    expect(screen.getAllByText('Registration readiness')).toHaveLength(2);
    expect(screen.getAllByText(/Registered readiness is required for transaction checkout/i).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('Registration stage informal allows up to catalog mode.')).toBeTruthy();
    expect(screen.getAllByText('Company requested mode')).toHaveLength(2);
    expect(screen.getAllByText('Catalog plus inquiry/contact CTAs')).toHaveLength(2);
  });

  it('updates platform max allowed storefront mode separately from requested mode', async () => {
    const user = userEvent.setup();
    render(<MemoryRouter><TenantManager /></MemoryRouter>);

    await screen.findByRole('heading', { name: 'Kusina & Cafe' });
    await user.type(screen.getByPlaceholderText('Search tenants, tokens, plans, or capabilities'), 'kusina');

    const platformPanel = screen.getByText('Platform max allowed').closest('.rounded-lg');
    expect(platformPanel).toBeTruthy();
    await user.selectOptions(within(platformPanel).getByLabelText(/Platform max allowed for Kusina & Cafe/i), 'catalog');

    await screen.findByText('Confirm capability change');
    expect(screen.getByText(/Platform will cap this tenant at Catalog only/i)).toBeTruthy();
    await user.type(screen.getByLabelText('Reason'), 'Platform reviewed storefront readiness cap');
    await user.click(screen.getByRole('button', { name: /Apply change/i }));

    await waitFor(() => {
      expect(mocks.adminServiceMock.updateTenantCapabilities).toHaveBeenCalledWith(
        'tenant-kusina',
        {
          platform_max_customer_access_mode: 'catalog',
          reason: 'Platform reviewed storefront readiness cap'
        }
      );
    });
  }, 15000);

  it('warns when Online Ordering remains capped by registration readiness', async () => {
    const user = userEvent.setup();
    render(<MemoryRouter><TenantManager /></MemoryRouter>);

    await screen.findByRole('heading', { name: 'Kusina & Cafe' });
    await user.type(screen.getByPlaceholderText('Search tenants, tokens, plans, or capabilities'), 'kusina');
    await user.click(screen.getByRole('button', { name: /Online ordering mode/i }));

    await screen.findByText('Confirm capability change');
    expect(screen.getByText(/checkout will remain capped at Catalog only until registration readiness is updated/i)).toBeTruthy();
  });

  it('updates registration readiness separately from requested mode', async () => {
    const user = userEvent.setup();
    render(<MemoryRouter><TenantManager /></MemoryRouter>);

    await screen.findByRole('heading', { name: 'Kusina & Cafe' });
    await user.type(screen.getByPlaceholderText('Search tenants, tokens, plans, or capabilities'), 'kusina');

    const readinessPanel = screen.getByText('Registration readiness').closest('.rounded-lg');
    expect(readinessPanel).toBeTruthy();
    await user.selectOptions(within(readinessPanel).getByLabelText(/Registration readiness for Kusina & Cafe/i), 'registered');

    await screen.findByText('Confirm capability change');
    expect(screen.getByText(/Checkout can become available when company requested mode and platform max are also Online ordering mode/i)).toBeTruthy();
    await user.type(screen.getByLabelText('Reason'), 'Approved registration evidence for online ordering');
    await user.click(screen.getByRole('button', { name: /Apply change/i }));

    await waitFor(() => {
      expect(mocks.adminServiceMock.updateTenantCapabilities).toHaveBeenCalledWith(
        'tenant-kusina',
        {
          customer_access_registration_stage: 'registered',
          reason: 'Approved registration evidence for online ordering'
        }
      );
    });
  });

  it('keeps storefront sub-modes disabled until Storefront Maps is visible', async () => {
    const user = userEvent.setup();
    render(<MemoryRouter><TenantManager /></MemoryRouter>);

    await screen.findByRole('heading', { name: 'Kate Store' });
    await user.type(screen.getByPlaceholderText('Search tenants, tokens, plans, or capabilities'), 'kate');

    expect(screen.getByText('Hidden from maps')).toBeTruthy();
    expect(screen.getByText('Turn on Storefront / Maps before changing the customer-facing sub-mode.')).toBeTruthy();
    expect(screen.getByRole('button', { name: /Map listing only/i }).disabled).toBe(true);
    expect(screen.getByRole('button', { name: /Storefront \/ Maps Off/i }).disabled).toBe(false);
  });

  it('loads and renders recent capability audit logs', async () => {
    const user = userEvent.setup();
    render(<MemoryRouter><TenantManager /></MemoryRouter>);

    await screen.findByRole('heading', { name: 'Kusina & Cafe' });
    await user.click(screen.getAllByRole('button', { name: /Audit/i })[0]);

    await waitFor(() => {
      expect(mocks.adminServiceMock.listTenantCapabilityAuditLogs).toHaveBeenCalledWith(
        'tenant-kusina',
        { limit: 20 }
      );
    });
    expect(await screen.findByText('Tenant requested POS restoration')).toBeTruthy();
    expect(screen.getByText(/POS Off/i)).toBeTruthy();
    expect(screen.getByText(/POS On/i)).toBeTruthy();
  });
});
