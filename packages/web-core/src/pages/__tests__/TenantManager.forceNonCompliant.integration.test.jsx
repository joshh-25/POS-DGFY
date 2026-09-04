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
    getTenantRevenueDashboard: vi.fn()
  },
  toastMock: {
    success: vi.fn(),
    error: vi.fn()
  }
}));

vi.mock('@/services/adminService', () => mocks.adminServiceMock);
vi.mock('sonner', () => ({ toast: mocks.toastMock }));

describe('TenantManager force non-compliant guardrails', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.adminServiceMock.getTenants.mockResolvedValue({
      data: [
        {
          id: 'legacy-tenant',
          name: 'Legacy Retail',
          admin_email: 'legacy@retail.test',
          status: 'active',
          plan: 'standard',
          compliance_mode_state: null,
          compliance_mode_choice_required: true,
          can_force_non_compliant: false,
          force_non_compliant_block_reason: 'Compliance mode has not been selected yet.',
          admin_compliance_mode_action: {
            action: 'select_mode',
            allowed: true,
            label: 'Set compliance mode',
            helper_text: 'Select non-compliant POS access or move the tenant into compliant pending mode.',
            options: ['non_compliant', 'compliant']
          },
          created_at: '2026-04-20T00:00:00.000Z'
        },
        {
          id: 'non-compliant-tenant',
          name: 'Non-compliant Retail',
          admin_email: 'noncompliant@retail.test',
          status: 'active',
          plan: 'standard',
          compliance_mode_state: 'non_compliant_active',
          compliance_mode_choice_required: false,
          can_force_non_compliant: false,
          force_non_compliant_block_reason: 'Tenant is already in non_compliant_active mode.',
          admin_compliance_mode_action: {
            action: 'upgrade_to_compliant_pending',
            allowed: true,
            label: 'Move to compliant pending',
            helper_text: 'Moves the tenant into the compliant path. Fiscal activation still requires the checklist.',
            options: []
          },
          created_at: '2026-04-20T00:00:00.000Z'
        },
        {
          id: 'compliant-tenant',
          name: 'Compliant Retail',
          admin_email: 'compliant@retail.test',
          status: 'active',
          plan: 'standard',
          compliance_mode_state: 'compliant_active',
          compliance_mode_choice_required: false,
          can_force_non_compliant: true,
          force_non_compliant_block_reason: null,
          admin_compliance_mode_action: {
            action: 'force_non_compliant',
            allowed: true,
            label: 'Force non-compliant',
            helper_text: 'Returns the tenant to non-fiscal POS access and disables fiscal output.',
            options: []
          },
          created_at: '2026-04-20T00:00:00.000Z'
        }
      ]
    });
    mocks.adminServiceMock.forceTenantNonCompliant.mockResolvedValue({ success: true });
    mocks.adminServiceMock.selectTenantComplianceMode.mockResolvedValue({ success: true });
    mocks.adminServiceMock.upgradeTenantComplianceMode.mockResolvedValue({ success: true });
    mocks.adminServiceMock.listStoreTemplates.mockResolvedValue({ success: true, data: { templates: [] } });
    mocks.adminServiceMock.getTenantRevenueDashboard.mockResolvedValue({ data: null });
  });

  afterEach(() => {
    cleanup();
  });

  it('renders the correct compliance lifecycle action for each tenant state', async () => {
    render(<MemoryRouter><TenantManager /></MemoryRouter>);

    await screen.findByRole('heading', { name: 'Legacy Retail' });
    await screen.findByRole('heading', { name: 'Non-compliant Retail' });
    await screen.findByRole('heading', { name: 'Compliant Retail' });

    expect(screen.getByRole('button', { name: /Set compliance mode/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Move to compliant pending/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Force non-compliant/i })).toBeTruthy();
  });

  it('submits force action from the confirmation modal with trimmed reason payload', async () => {
    const user = userEvent.setup();
    render(<MemoryRouter><TenantManager /></MemoryRouter>);

    await screen.findByRole('heading', { name: 'Compliant Retail' });

    await user.click(screen.getByRole('button', { name: /Force non-compliant/i }));
    expect(await screen.findByText('Fiscal output is disabled and the tenant returns to non-fiscal POS access.')).toBeTruthy();
    const dialog = screen.getByRole('dialog');
    await user.type(within(dialog).getByLabelText(/Reason/i), '  Emergency rollback  ');
    await user.click(within(dialog).getByRole('button', { name: /^Force non-compliant$/i }));

    await waitFor(() => {
      expect(mocks.adminServiceMock.forceTenantNonCompliant).toHaveBeenCalledWith(
        'compliant-tenant',
        {
          reason: 'Emergency rollback',
          context: { source: 'tenant_manager_modal' }
        }
      );
    });
  });

  it('selects compliant pending for legacy tenants without activating fiscal mode', async () => {
    const user = userEvent.setup();
    render(<MemoryRouter><TenantManager /></MemoryRouter>);

    await screen.findByRole('heading', { name: 'Legacy Retail' });
    await user.click(screen.getByRole('button', { name: /Set compliance mode/i }));
    let dialog = screen.getByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: /^Compliant pending$/i }));
    expect(await screen.findByText('POS remains available, but fiscal issuance waits for checklist activation.')).toBeTruthy();
    dialog = screen.getByRole('dialog');
    await user.type(within(dialog).getByLabelText(/Reason/i), 'Tenant requested compliant onboarding');
    await user.click(within(dialog).getByRole('button', { name: /Set compliant pending/i }));

    await waitFor(() => {
      expect(mocks.adminServiceMock.selectTenantComplianceMode).toHaveBeenCalledWith(
        'legacy-tenant',
        {
          mode_choice: 'compliant',
          reason: 'Tenant requested compliant onboarding',
          context: { source: 'tenant_manager_modal' }
        }
      );
    });
  });

  it('moves non-compliant tenant to compliant pending without compliant active activation', async () => {
    const user = userEvent.setup();
    render(<MemoryRouter><TenantManager /></MemoryRouter>);

    await screen.findByRole('heading', { name: 'Non-compliant Retail' });
    await user.click(screen.getByRole('button', { name: /Move to compliant pending/i }));
    expect(await screen.findByText('The tenant enters the compliant path. Fiscal issuance still waits for checklist activation.')).toBeTruthy();
    const dialog = screen.getByRole('dialog');
    await user.type(within(dialog).getByLabelText(/Reason/i), 'Tenant is preparing compliance documents');
    await user.click(within(dialog).getByRole('button', { name: /^Move to compliant pending$/i }));

    await waitFor(() => {
      expect(mocks.adminServiceMock.upgradeTenantComplianceMode).toHaveBeenCalledWith(
        'non-compliant-tenant',
        {
          reason: 'Tenant is preparing compliance documents',
          context: { source: 'tenant_manager_modal' }
        }
      );
    });
    expect(mocks.adminServiceMock.upgradeTenantComplianceMode.mock.calls[0][1]).not.toHaveProperty('mode_state', 'compliant_active');
  });

  it('blocks force action when backend eligibility says false even if lifecycle appears compliant', async () => {
    const user = userEvent.setup();
    mocks.adminServiceMock.getTenants.mockResolvedValue({
      data: [
        {
          id: 'server-blocked-tenant',
          name: 'Server Blocked Retail',
          admin_email: 'blocked@retail.test',
          status: 'active',
          plan: 'premium',
          compliance_mode_state: 'compliant_active',
          compliance_mode_choice_required: false,
          can_force_non_compliant: false,
          force_non_compliant_block_reason: 'Tenant force override is temporarily blocked by policy gate.',
          admin_compliance_mode_action: {
            action: 'force_non_compliant',
            allowed: false,
            label: 'Force non-compliant',
            helper_text: 'Tenant force override is temporarily blocked by policy gate.',
            options: []
          }
        }
      ]
    });

    render(<MemoryRouter><TenantManager /></MemoryRouter>);
    const forceButton = await screen.findByRole('button', { name: /Force non-compliant/i });

    expect(forceButton.hasAttribute('disabled')).toBe(true);
    expect(screen.getByText('Tenant force override is temporarily blocked by policy gate.')).toBeTruthy();

    await user.click(forceButton);
    expect(mocks.adminServiceMock.forceTenantNonCompliant).not.toHaveBeenCalled();
  });
});
