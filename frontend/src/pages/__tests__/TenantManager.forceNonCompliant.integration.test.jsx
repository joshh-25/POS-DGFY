/** @vitest-environment jsdom */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import TenantManager from '../../../Pages/admin/TenantManager.jsx';

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
    listTenantComplianceArtifacts: vi.fn(),
    listTenantCompliancePeripherals: vi.fn(),
    getTenantComplianceChecklist: vi.fn(),
    listTenantComplianceAuditLogs: vi.fn(),
    listTenantComplianceSecurityIncidents: vi.fn(),
    updateTenantComplianceArtifactVerification: vi.fn(),
    updateTenantCompliancePeripheralVerification: vi.fn(),
    acknowledgeTenantComplianceSecurityIncident: vi.fn(),
    resolveTenantComplianceSecurityIncident: vi.fn(),
    updateComplianceFinalReviewDocumentReview: vi.fn()
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
          created_at: '2026-04-20T00:00:00.000Z'
        }
      ]
    });
    mocks.adminServiceMock.forceTenantNonCompliant.mockResolvedValue({ success: true });
  });

  afterEach(() => {
    cleanup();
  });

  it('disables force action for tenants outside compliant_pending/compliant_active', async () => {
    render(<TenantManager />);

    await screen.findByText('Legacy Retail');
    await screen.findByText('Compliant Retail');

    const forceButtons = screen.getAllByRole('button', { name: /Force non-compliant/i });
    expect(forceButtons).toHaveLength(2);
    expect(forceButtons[0].hasAttribute('disabled')).toBe(true);
    expect(forceButtons[1].hasAttribute('disabled')).toBe(false);
    expect(screen.getByText('Compliance mode has not been selected yet.')).toBeTruthy();
  });

  it('submits force action for allowed compliant states with trimmed reason payload', async () => {
    const user = userEvent.setup();
    const promptSpy = vi.spyOn(window, 'prompt').mockReturnValue('  Emergency rollback  ');
    render(<TenantManager />);

    await screen.findByText('Compliant Retail');

    const forceButtons = screen.getAllByRole('button', { name: /Force non-compliant/i });
    await user.click(forceButtons[1]);

    await waitFor(() => {
      expect(mocks.adminServiceMock.forceTenantNonCompliant).toHaveBeenCalledWith(
        'compliant-tenant',
        { reason: 'Emergency rollback' }
      );
    });
    expect(promptSpy).toHaveBeenCalled();
    promptSpy.mockRestore();
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
          force_non_compliant_block_reason: 'Tenant force override is temporarily blocked by policy gate.'
        }
      ]
    });

    render(<TenantManager />);
    const forceButton = await screen.findByRole('button', { name: /Force non-compliant/i });

    expect(forceButton.hasAttribute('disabled')).toBe(true);
    expect(screen.getByText('Tenant force override is temporarily blocked by policy gate.')).toBeTruthy();

    await user.click(forceButton);
    expect(mocks.adminServiceMock.forceTenantNonCompliant).not.toHaveBeenCalled();
  });
});
