/** @vitest-environment jsdom */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Outlet, Route, Routes, useNavigate } from 'react-router-dom';
import TenantDetailLayout from '../../../Pages/TenantDetailLayout.jsx';
import TenantLifecycle from '../../../Pages/TenantLifecycle.jsx';
import TenantRegistration from '../../../Pages/TenantRegistration.jsx';

const mocks = vi.hoisted(() => ({
  adminServiceMock: {
    getTenant: vi.fn(),
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

const AdminContext = () => <Outlet context={{ adminProfile: { permissions: ['admin.tenants', 'admin.invoices'] } }} />;
const RegistrationRouteSwitcher = () => {
  const navigate = useNavigate();
  return <button type="button" onClick={() => navigate('/admin/tenants/second-registration-tenant/registration')}>Switch tenant</button>;
};
const renderTenantSection = (tenant, section = 'lifecycle') => {
  mocks.adminServiceMock.getTenant.mockResolvedValue({ data: tenant });
  return render(<MemoryRouter initialEntries={[`/admin/tenants/${tenant.id}/${section}`]}><Routes>
    <Route path="/admin" element={<AdminContext />}>
      <Route path="tenants/:id" element={<TenantDetailLayout />}>
        <Route path="lifecycle" element={<TenantLifecycle />} />
        <Route path="registration" element={<TenantRegistration />} />
      </Route>
    </Route>
  </Routes></MemoryRouter>);
};

describe('Tenant Lifecycle and Registration detail sections', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('does not show a late registration response after switching tenants', async () => {
    let resolveFirstRegistration;
    mocks.adminServiceMock.getTenant.mockImplementation(async (tenantId) => ({
      data: { id: tenantId, name: tenantId === 'first-registration-tenant' ? 'First Tenant' : 'Second Tenant', status: 'active' }
    }));
    mocks.adminServiceMock.getTenantRegistration.mockImplementation((tenantId) => (
      tenantId === 'first-registration-tenant'
        ? new Promise((resolve) => { resolveFirstRegistration = resolve; })
        : Promise.resolve({ data: { company_name: 'Second Tenant Evidence', review_status: 'approved', uploads: [] } })
    ));

    render(<MemoryRouter initialEntries={['/admin/tenants/first-registration-tenant/registration']}>
      <RegistrationRouteSwitcher />
      <Routes>
        <Route path="/admin" element={<AdminContext />}>
          <Route path="tenants/:id" element={<TenantDetailLayout />}>
            <Route path="registration" element={<TenantRegistration />} />
          </Route>
        </Route>
      </Routes>
    </MemoryRouter>);

    await screen.findByRole('heading', { name: 'First Tenant' });
    await waitFor(() => expect(mocks.adminServiceMock.getTenantRegistration).toHaveBeenCalledWith('first-registration-tenant'));
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Switch tenant' }));

    await screen.findByRole('heading', { name: 'Second Tenant' });
    expect(await screen.findByText('Second Tenant Evidence', { selector: 'dd' })).toBeTruthy();
    resolveFirstRegistration({ data: { company_name: 'Stale First Tenant Evidence', review_status: 'pending', uploads: [] } });

    await waitFor(() => expect(screen.queryByText('Stale First Tenant Evidence')).toBeNull());
    expect(screen.getByText('Second Tenant Evidence', { selector: 'dd' })).toBeTruthy();
  });

  afterEach(() => {
    cleanup();
  });

  it('does not offer public approval actions for a pending tenant without an application', async () => {
    renderTenantSection({
      id: 'tenant-without-application',
      name: 'Admin Provisioned Company',
      admin_email: 'owner@example.test',
      status: 'pending',
      provisioning_source: 'platform_admin',
      plan: 'standard',
      created_at: '2026-09-10T00:00:00.000Z'
    });

    await screen.findByRole('heading', { name: 'Admin Provisioned Company' });
    expect(screen.queryByRole('button', { name: /^Approve$/i })).toBeNull();
    expect(screen.getByText('No pending public registration is available for approval.')).toBeTruthy();
  });

  it('offers approval and rejection only for a pending public registration', async () => {
    renderTenantSection({
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
    });

    await screen.findByRole('heading', { name: 'Public Registration Company' });
    expect(screen.getByRole('button', { name: /^Approve$/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /^Reject$/i })).toBeTruthy();
  });

  it('shows retry only when the server marks setup as retryable', async () => {
    renderTenantSection({
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
    });

    await screen.findByRole('heading', { name: 'Stale Provisioning Company' });
    expect(screen.getByRole('button', { name: /Retry setup/i })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /^Approve$/i })).toBeNull();
  });

  it('shows setup status for a pending tenant whose application is not actionable', async () => {
    renderTenantSection({
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
    });

    await screen.findByRole('heading', { name: 'Setting Up Company' });
    expect(screen.queryByRole('button', { name: /^Approve$/i })).toBeNull();
    expect(screen.getByText('Setup is in progress')).toBeTruthy();
    expect(screen.getByText('Company setup is already in progress.')).toBeTruthy();
  });

  it('renders registration evidence as readable labeled content instead of raw JSON', async () => {
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

    renderTenantSection({
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
    }, 'registration');

    await screen.findByRole('heading', { name: 'Registration' });
    await screen.findByText('Company name');
    expect(screen.getByText('Company name')).toBeTruthy();
    expect(screen.getAllByText('Juan’s Kitchen', { selector: 'dd' })).toHaveLength(2);
    expect(screen.getByText('Food & Beverage')).toBeTruthy();
    expect(screen.getByText('Monday: 09:00–18:00')).toBeTruthy();
    expect(screen.getByText('Recorded agreement states and acknowledgement evidence are shown when available.')).toBeTruthy();
    expect(screen.getByText(/Queued for processing/)).toBeTruthy();
    expect(screen.getByText(/Menu or catalog/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Preview' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Download' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Revoke' })).toBeTruthy();
    expect(screen.queryByText(/"company_name"/)).toBeNull();
    expect(document.body.textContent).not.toContain('submission_snapshot');
    expect(document.body.textContent).not.toContain('legal_terms_snapshot');
    expect(document.body.textContent).not.toContain('fnb');
  });

  it('keeps missing legal acceptance flags in an unknown state', async () => {
    mocks.adminServiceMock.getTenantRegistration.mockResolvedValue({
      data: { legal_terms_snapshot: { acknowledgement_hash: 'hash-without-flags' } }
    });
    renderTenantSection({
      id: 'legacy-legal-tenant',
      name: 'Legacy Legal Record',
      status: 'active'
    }, 'registration');

    await screen.findByText('Recorded agreement states and acknowledgement evidence are shown when available.');
    expect(screen.getAllByText('Not recorded')).toHaveLength(2);
    expect(screen.queryByText('Accepted')).toBeNull();
  });

  it('renders an empty state when the registration application is not found', async () => {
    mocks.adminServiceMock.getTenantRegistration.mockRejectedValue({
      response: { status: 404, data: { code: 'RESOURCE_NOT_FOUND', message: 'Resource not found.' } }
    });

    renderTenantSection({ id: 'tenant-without-registration', name: 'Assisted Tenant', status: 'active' }, 'registration');

    expect(await screen.findByRole('heading', { name: 'No registration application' })).toBeTruthy();
    expect(screen.getByText(/no public registration application or submitted registration evidence/i)).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.queryByText('Review record')).toBeNull();
  });

  it.each([
    [{ response: { status: 401, data: { message: 'Unauthorized. Please login again.' } } }, 'Unauthorized. Please login again.'],
    [{ response: { status: 403, data: { message: 'You do not have permission to perform this action.' } } }, 'You do not have permission to perform this action.'],
    [{ response: { status: 503, data: { message: 'Service unavailable. Please try again.' } } }, 'Service unavailable. Please try again.'],
    [{ request: {}, message: 'Network Error' }, 'No response from server. Check your connection.']
  ])('keeps permission, server, and transport failures distinct and retryable', async (failure, message) => {
    const user = userEvent.setup();
    mocks.adminServiceMock.getTenantRegistration.mockRejectedValueOnce(failure);

    renderTenantSection({ id: 'tenant-registration-error', name: 'Registration Error Tenant', status: 'active' }, 'registration');

    expect((await screen.findByRole('alert')).textContent).toContain(message);
    expect(screen.getByRole('button', { name: 'Retry' })).toBeTruthy();
    expect(screen.queryByRole('heading', { name: 'No registration application' })).toBeNull();

    mocks.adminServiceMock.getTenantRegistration.mockResolvedValue({ data: { review_status: 'approved', uploads: [] } });
    await user.click(screen.getByRole('button', { name: 'Retry' }));
    expect(await screen.findByText('Review record')).toBeTruthy();
    expect(mocks.adminServiceMock.getTenantRegistration).toHaveBeenCalledTimes(2);
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
      renderTenantSection({
        id: 'private-upload-tenant',
        name: 'Private Upload Company',
        admin_email: 'applicant@example.test',
        status: 'pending',
        registration_action: { action: 'approve', allowed: true, helper_text: 'Approve the pending public registration.' },
        registrationApplication: { review_status: 'pending', provisioning_status: 'not_started' },
        plan: 'standard',
        created_at: '2026-09-10T00:00:00.000Z'
      }, 'registration');
      await screen.findByRole('heading', { name: 'Registration' });

      await user.click(await screen.findByRole('button', { name: 'Download' }));
      await waitFor(() => expect(mocks.adminServiceMock.downloadTenantRegistrationUpload).toHaveBeenCalledWith('private-upload-tenant', 'upload-1'));
      expect(createObjectURL).toHaveBeenCalledWith(blob);
      expect(clickSpy).toHaveBeenCalled();
      expect(clickedAnchor).not.toBeNull();
      expect(clickedAnchor.download).toBe('menu.png');

      await waitFor(() => expect(screen.getByRole('button', { name: 'Preview' }).disabled).toBe(false));
      await user.click(screen.getByRole('button', { name: 'Preview' }));
      await waitFor(() => expect(openSpy).toHaveBeenCalledWith('about:blank', '_blank'));
      await waitFor(() => expect(openedWindow.location.href).toBe('blob:registration-upload'));
    } finally {
      globalThis.URL.createObjectURL = originalCreateObjectURL;
      globalThis.URL.revokeObjectURL = originalRevokeObjectURL;
      openSpy.mockRestore();
      clickSpy.mockRestore();
    }
  });
});
