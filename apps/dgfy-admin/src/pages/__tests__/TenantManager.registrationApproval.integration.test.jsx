/** @vitest-environment jsdom */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import TenantManager from '../../../Pages/TenantManager.jsx';

const mocks = vi.hoisted(() => ({
  adminServiceMock: {
    getTenants: vi.fn(),
    updateTenant: vi.fn(),
    createTenant: vi.fn(),
    deleteTenant: vi.fn(),
    approveTenant: vi.fn(),
    rejectTenant: vi.fn(),
    retryTenantProvisioning: vi.fn(),
    getTenantRegistration: vi.fn(),
    downloadTenantRegistrationUpload: vi.fn(),
    revokeTenantRegistrationUpload: vi.fn(),
    adminReactivateTenant: vi.fn(),
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

const renderTenants = (tenants) => {
  mocks.adminServiceMock.getTenants.mockResolvedValue({ data: tenants });
  mocks.adminServiceMock.listStoreTemplates.mockResolvedValue({ success: true, data: { templates: [] } });
  mocks.adminServiceMock.getTenantRevenueDashboard.mockResolvedValue({ data: null });
  mocks.adminServiceMock.listTenantRevenueTransactions.mockResolvedValue({ data: { transactions: [] } });
  mocks.adminServiceMock.listTenantSettlementBatches.mockResolvedValue({ data: { batches: [] } });
  mocks.adminServiceMock.listTenantRevenueReconciliation.mockResolvedValue({ data: { records: [] } });
  mocks.adminServiceMock.listTenantRevenueFeePolicies.mockResolvedValue({ data: { policies: [] } });
  mocks.adminServiceMock.listTenantRevenueAdjustments.mockResolvedValue({ data: { adjustments: [] } });
  return render(<MemoryRouter><TenantManager /></MemoryRouter>);
};

describe('TenantManager public registration approval actions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it('does not offer public approval actions for a pending tenant without an application', async () => {
    renderTenants([{
      id: 'tenant-without-application',
      name: 'Admin Provisioned Company',
      admin_email: 'owner@example.test',
      status: 'pending',
      provisioning_source: 'platform_admin',
      plan: 'standard',
      created_at: '2026-09-10T00:00:00.000Z'
    }]);

    const card = await screen.findByRole('heading', { name: 'Admin Provisioned Company' });
    const tenantCard = card.closest('div.bg-white');
    expect(within(tenantCard).queryByRole('button', { name: /^Approve$/i })).toBeNull();
    expect(within(tenantCard).queryByRole('button', { name: /^Reject$/i })).toBeNull();
    expect(within(tenantCard).getByText('No pending public registration is available for approval.')).toBeTruthy();
  });

  it('offers approval and rejection only for a pending public registration', async () => {
    renderTenants([{
      id: 'public-registration-tenant',
      name: 'Public Registration Company',
      admin_email: 'applicant@example.test',
      status: 'pending',
      registration_action: {
        action: 'approve',
        allowed: true,
        helper_text: 'Approve the pending public registration.'
      },
      registrationApplication: {
        review_status: 'pending',
        provisioning_status: 'not_started'
      },
      plan: 'standard',
      created_at: '2026-09-10T00:00:00.000Z'
    }]);

    const card = await screen.findByRole('heading', { name: 'Public Registration Company' });
    const tenantCard = card.closest('div.bg-white');
    expect(within(tenantCard).getByRole('button', { name: /^Approve$/i })).toBeTruthy();
    expect(within(tenantCard).getByRole('button', { name: /^Reject$/i })).toBeTruthy();
  });

  it('shows retry only when the server marks setup as retryable', async () => {
    renderTenants([{
      id: 'stale-provisioning-tenant',
      name: 'Stale Provisioning Company',
      admin_email: 'applicant@example.test',
      status: 'pending',
      registration_action: {
        action: 'retry',
        allowed: true,
        helper_text: 'The previous setup attempt is stale and can be retried.'
      },
      registrationApplication: {
        review_status: 'approved',
        provisioning_status: 'in_progress'
      },
      plan: 'standard',
      created_at: '2026-09-10T00:00:00.000Z'
    }]);

    const card = await screen.findByRole('heading', { name: 'Stale Provisioning Company' });
    const tenantCard = card.closest('div.bg-white');
    expect(within(tenantCard).getByRole('button', { name: /Retry setup/i })).toBeTruthy();
    expect(within(tenantCard).queryByRole('button', { name: /^Approve$/i })).toBeNull();
    expect(within(tenantCard).queryByRole('button', { name: /^Reject$/i })).toBeNull();
  });

  it('shows setup status for a pending tenant whose application is not actionable', async () => {
    renderTenants([{
      id: 'setting-up-tenant',
      name: 'Setting Up Company',
      admin_email: 'applicant@example.test',
      status: 'pending',
      registration_action: {
        action: 'setting_up',
        allowed: false,
        helper_text: 'Company setup is already in progress.'
      },
      registrationApplication: {
        review_status: 'approved',
        provisioning_status: 'in_progress'
      },
      plan: 'standard',
      created_at: '2026-09-10T00:00:00.000Z'
    }]);

    const card = await screen.findByRole('heading', { name: 'Setting Up Company' });
    const tenantCard = card.closest('div.bg-white');
    expect(within(tenantCard).queryByRole('button', { name: /^Approve$/i })).toBeNull();
    expect(within(tenantCard).getByRole('status').textContent).toContain('Company setup is already in progress.');
  });

  it('renders registration evidence as readable labeled content instead of raw JSON', async () => {
    const user = userEvent.setup();
    mocks.adminServiceMock.getTenantRegistration.mockResolvedValue({
      data: {
        review_status: 'pending',
        provisioning_status: 'not_started',
        current_attempt_no: 1,
        submission_snapshot: {
          company_name: 'Juan’s Kitchen',
          business_type: 'Restaurant',
          industry_tag: 'Food & Beverage',
          storefront_profile: { phone: '0917 123 4567' },
          location: { city: 'Iloilo City' },
          hours: [{ day: 'Monday', open: '09:00', close: '18:00', closed: false }]
        },
        legal_terms_snapshot: {
          accepted_company_terms: true,
          accepted_marketplace_terms: true,
          company_terms_version: 'company-terms-v1',
          marketplace_terms_version: 'marketplace-terms-v1',
          acknowledgement_text: 'The applicant accepted both required agreements.',
          acknowledgement_hash: 'hash-123'
        },
        uploads: [{
          id: 'upload-1',
          asset_kind: 'menu',
          original_filename: 'menu.png',
          mime_type: 'image/png',
          review_status: 'pending',
          extraction_status: 'queued'
        }]
      }
    });

    renderTenants([{
      id: 'readable-review-tenant',
      name: 'Juan’s Kitchen',
      admin_email: 'applicant@example.test',
      status: 'pending',
      registration_action: {
        action: 'approve',
        allowed: true,
        helper_text: 'Approve the pending public registration.'
      },
      registrationApplication: {
        review_status: 'pending',
        provisioning_status: 'not_started'
      },
      plan: 'standard',
      created_at: '2026-09-10T00:00:00.000Z'
    }]);

    const card = await screen.findByRole('heading', { name: 'Juan’s Kitchen' });
    await user.click(within(card.closest('div.bg-white')).getByRole('button', { name: 'Review registration' }));

    const dialog = await screen.findByRole('dialog', { name: 'Registration review' });
    expect(within(dialog).getByText('Company name')).toBeTruthy();
    expect(within(dialog).getByText('Juan’s Kitchen', { selector: 'dd' })).toBeTruthy();
    expect(within(dialog).getByText('Food & Beverage', { selector: 'dd' })).toBeTruthy();
    expect(within(dialog).getByText('Monday: 09:00–18:00')).toBeTruthy();
    expect(within(dialog).getByText('The registration contains a recorded acknowledgement for both required legal agreements.')).toBeTruthy();
    expect(within(dialog).getByText('Queued for processing')).toBeTruthy();
    expect(within(dialog).getByText('Menu or catalog')).toBeTruthy();
    expect(within(dialog).getByRole('button', { name: 'View' })).toBeTruthy();
    expect(within(dialog).getByRole('button', { name: 'Download' })).toBeTruthy();
    expect(within(dialog).getByRole('button', { name: 'Revoke' })).toBeTruthy();
    expect(within(dialog).queryByText(/"company_name"/)).toBeNull();
    expect(dialog.textContent).not.toContain('submission_snapshot');
    expect(dialog.textContent).not.toContain('legal_terms_snapshot');
    expect(dialog.textContent).not.toContain('fnb');
  });

  it('uses the authenticated private blob for view and download actions', async () => {
    const user = userEvent.setup();
    const upload = {
      id: 'upload-1',
      asset_kind: 'menu',
      original_filename: 'menu.png',
      mime_type: 'image/png',
      review_status: 'pending',
      extraction_status: 'queued'
    };
    mocks.adminServiceMock.getTenantRegistration.mockResolvedValue({
      data: {
        review_status: 'pending',
        provisioning_status: 'not_started',
        current_attempt_no: 1,
        submission_snapshot: { company_name: 'Private Upload Company' },
        legal_terms_snapshot: { accepted_company_terms: true, accepted_marketplace_terms: true },
        uploads: [upload]
      }
    });
    const blob = new Blob(['private image bytes'], { type: 'image/png' });
    mocks.adminServiceMock.downloadTenantRegistrationUpload.mockResolvedValue({ data: blob });

    const originalCreateObjectURL = globalThis.URL.createObjectURL;
    const originalRevokeObjectURL = globalThis.URL.revokeObjectURL;
    const createObjectURL = vi.fn(() => 'blob:registration-upload');
    const revokeObjectURL = vi.fn();
    globalThis.URL.createObjectURL = createObjectURL;
    globalThis.URL.revokeObjectURL = revokeObjectURL;
    const openedWindow = { location: { href: '' }, close: vi.fn() };
    const openSpy = vi.spyOn(window, 'open').mockReturnValue(openedWindow);
    let clickedAnchor = null;
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function click() {
      clickedAnchor = this;
    });

    try {
      renderTenants([{
        id: 'private-upload-tenant',
        name: 'Private Upload Company',
        admin_email: 'applicant@example.test',
        status: 'pending',
        registration_action: { action: 'approve', allowed: true, helper_text: 'Approve the pending public registration.' },
        registrationApplication: { review_status: 'pending', provisioning_status: 'not_started' },
        plan: 'standard',
        created_at: '2026-09-10T00:00:00.000Z'
      }]);

      const card = await screen.findByRole('heading', { name: 'Private Upload Company' });
      await user.click(within(card.closest('div.bg-white')).getByRole('button', { name: 'Review registration' }));
      const dialog = await screen.findByRole('dialog', { name: 'Registration review' });

      await user.click(within(dialog).getByRole('button', { name: 'Download' }));
      await waitFor(() => expect(mocks.adminServiceMock.downloadTenantRegistrationUpload).toHaveBeenCalledWith('private-upload-tenant', 'upload-1'));
      expect(createObjectURL).toHaveBeenCalledWith(blob);
      expect(clickSpy).toHaveBeenCalled();
      expect(clickedAnchor).not.toBeNull();
      expect(clickedAnchor.download).toBe('menu.png');

      await waitFor(() => expect(within(dialog).getByRole('button', { name: 'View' }).disabled).toBe(false));
      await user.click(within(dialog).getByRole('button', { name: 'View' }));
      await waitFor(() => expect(openSpy).toHaveBeenCalledWith('', '_blank'));
      await waitFor(() => expect(openedWindow.location.href).toBe('blob:registration-upload'));
    } finally {
      globalThis.URL.createObjectURL = originalCreateObjectURL;
      globalThis.URL.revokeObjectURL = originalRevokeObjectURL;
      openSpy.mockRestore();
      clickSpy.mockRestore();
    }
  });
});
