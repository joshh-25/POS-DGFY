/** @vitest-environment jsdom */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Outlet, Route, Routes } from 'react-router-dom';
import TenantManager from '../../../Pages/TenantManager.jsx';
import TenantDetailLayout from '../../../Pages/TenantDetailLayout.jsx';
import TenantOverview from '../../../Pages/TenantOverview.jsx';
import TenantLifecycle from '../../../Pages/TenantLifecycle.jsx';
import TenantRegistration from '../../../Pages/TenantRegistration.jsx';
import TenantCompliance from '../../../Pages/TenantCompliance.jsx';
import TenantStoreSetup from '../../../Pages/TenantStoreSetup.jsx';
import TenantAccess from '../../../Pages/TenantAccess.jsx';

const mocks = vi.hoisted(() => ({
    adminService: {
        getTenant: vi.fn(), getTenants: vi.fn(), listCompanyRegistrationDrafts: vi.fn(),
        listDgfyAccounts: vi.fn(), assignTenantOwner: vi.fn(),
        approveTenant: vi.fn(), rejectTenant: vi.fn(), retryTenantProvisioning: vi.fn(),
        adminReactivateTenant: vi.fn(), updateTenant: vi.fn(), deleteTenant: vi.fn(),
        getTenantRegistration: vi.fn(), downloadTenantRegistrationUpload: vi.fn(),
        downloadCompanyRegistrationMenuArchive: vi.fn(), revokeTenantRegistrationUpload: vi.fn(),
        listTenantComplianceArtifacts: vi.fn(), listTenantCompliancePeripherals: vi.fn(),
        getTenantComplianceChecklist: vi.fn(), listTenantComplianceAuditLogs: vi.fn(),
        listTenantComplianceSecurityIncidents: vi.fn(), updateTenantComplianceArtifactVerification: vi.fn(),
        updateTenantCompliancePeripheralVerification: vi.fn(), acknowledgeTenantComplianceSecurityIncident: vi.fn(),
        resolveTenantComplianceSecurityIncident: vi.fn(), forceTenantNonCompliant: vi.fn(),
        selectTenantComplianceMode: vi.fn(), upgradeTenantComplianceMode: vi.fn(),
        updateComplianceFinalReviewDocumentReview: vi.fn(),
        getTenantPosMetadata: vi.fn(), listTenantPosMetadataAuditLogs: vi.fn(),
        updateTenantPosMetadata: vi.fn(), listStoreTemplates: vi.fn(), applyTenantTemplate: vi.fn(),
        updateTenantCapabilities: vi.fn(), listTenantCapabilityAuditLogs: vi.fn()
    },
    toast: { success: vi.fn(), error: vi.fn() }
}));

vi.mock('@/services/adminService', () => mocks.adminService);
vi.mock('sonner', () => ({ toast: mocks.toast }));

const tenantFactory = (changes = {}) => ({
    id: 'tenant-1',
    name: 'North Market',
    admin_email: 'ops@example.test',
    domain: 'north.example.test',
    status: 'active',
    effective_plan: 'premium',
    plan: 'standard',
    ownership_status: 'claimed',
    owner_dgfy_account_id: 'account-old',
    compliance_mode_state: 'compliant_active',
    compliance_policy_version: '2026.10',
    capabilities: { ims_enabled: true, pos_enabled: true, storefront_visible: false },
    ...changes
});

const profile = (changes = {}) => ({
    is_master: false,
    permissions: ['admin.tenants', 'admin.dgfy_accounts', 'admin.invoices', 'admin.payments'],
    ...changes
});

function AdminContext({ adminProfile }) {
    return <Outlet context={{ adminProfile }} />;
}

function renderAdminRoute(path, adminProfile = profile()) {
    return render(
        <MemoryRouter initialEntries={[path]}>
            <Routes>
                <Route path="/admin" element={<AdminContext adminProfile={adminProfile} />}>
                    <Route path="tenants" element={<TenantManager />} />
                    <Route path="tenants/:id" element={<TenantDetailLayout />}>
                        <Route index element={<TenantOverview />} />
                        <Route path="lifecycle" element={<TenantLifecycle />} />
                        <Route path="registration" element={<TenantRegistration />} />
                        <Route path="compliance" element={<TenantCompliance />} />
                        <Route path="store-setup" element={<TenantStoreSetup />} />
                        <Route path="access" element={<TenantAccess />} />
                    </Route>
                </Route>
            </Routes>
        </MemoryRouter>
    );
}

const setTenantRead = (tenant = tenantFactory()) => mocks.adminService.getTenant.mockResolvedValue({ data: tenant });

describe('Platform Admin tenant detail sections', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        setTenantRead();
        mocks.adminService.getTenants.mockResolvedValue({ data: [tenantFactory()] });
        mocks.adminService.listCompanyRegistrationDrafts.mockResolvedValue({ data: [] });
        mocks.adminService.listDgfyAccounts.mockResolvedValue({ data: { accounts: [] } });
        mocks.adminService.assignTenantOwner.mockResolvedValue({ success: true });
        mocks.adminService.approveTenant.mockResolvedValue({ success: true });
        mocks.adminService.rejectTenant.mockResolvedValue({ success: true });
        mocks.adminService.retryTenantProvisioning.mockResolvedValue({ success: true });
        mocks.adminService.adminReactivateTenant.mockResolvedValue({ success: true });
        mocks.adminService.updateTenant.mockResolvedValue({ success: true });
        mocks.adminService.deleteTenant.mockResolvedValue({ success: true });
        mocks.adminService.getTenantRegistration.mockResolvedValue({ data: { review_status: 'approved', provisioning_status: 'completed', uploads: [] } });
        mocks.adminService.listTenantComplianceArtifacts.mockResolvedValue({ data: { artifacts: [] } });
        mocks.adminService.listTenantCompliancePeripherals.mockResolvedValue({ data: { peripherals: [] } });
        mocks.adminService.getTenantComplianceChecklist.mockResolvedValue({ data: { ready_for_compliant_activation: true, section_progress: {}, activation_blockers: [] } });
        mocks.adminService.listTenantComplianceAuditLogs.mockResolvedValue({ data: { logs: [] } });
        mocks.adminService.listTenantComplianceSecurityIncidents.mockResolvedValue({ data: { incidents: [] } });
        mocks.adminService.getTenantPosMetadata.mockResolvedValue({ data: { current: {} } });
        mocks.adminService.listTenantPosMetadataAuditLogs.mockResolvedValue({ data: { logs: [] } });
        mocks.adminService.listStoreTemplates.mockResolvedValue({ data: { templates: [] } });
        mocks.adminService.applyTenantTemplate.mockResolvedValue({ success: true });
    });

    afterEach(cleanup);

    it('loads a direct section route and carries the complete directory query through navigation and return', async () => {
        renderAdminRoute('/admin/tenants/tenant-1/lifecycle?status=active&custom=keep');
        expect(await screen.findByRole('heading', { name: 'North Market' })).toBeTruthy();
        expect(screen.getByRole('heading', { name: 'Lifecycle' })).toBeTruthy();
        expect(mocks.adminService.getTenant).toHaveBeenCalledExactlyOnceWith('tenant-1');
        expect(screen.getByRole('link', { name: 'Overview' }).getAttribute('href')).toBe('/admin/tenants/tenant-1?status=active&custom=keep');
        expect(screen.getByRole('link', { name: /Back to tenants/ }).getAttribute('href')).toBe('/admin/tenants?status=active&custom=keep');
    });

    it('moves lifecycle approval off the directory and keeps invoice creation a separate grant-checked follow-up', async () => {
        const pendingTenant = tenantFactory({
            status: 'pending',
            registration_action: { action: 'approve', allowed: true, helper_text: 'Approve the public registration.' },
            registrationApplication: { id: 'application-1', review_status: 'pending', provisioning_status: 'not_started' }
        });
        setTenantRead(pendingTenant);
        const user = userEvent.setup();
        renderAdminRoute('/admin/tenants/tenant-1/lifecycle');
        await user.click(await screen.findByRole('button', { name: 'Approve' }));
        const dialog = await screen.findByRole('dialog', { name: 'Approve tenant registration?' });
        expect(within(dialog).getByRole('button', { name: 'Approve registration' }).disabled).toBe(false);
        await user.click(within(dialog).getByRole('button', { name: 'Approve registration' }));
        await waitFor(() => expect(mocks.adminService.approveTenant).toHaveBeenCalledExactlyOnceWith('tenant-1'));
        expect(mocks.adminService.deleteTenant).not.toHaveBeenCalled();
        expect(await screen.findByRole('link', { name: 'Open invoices' })).toBeTruthy();

        cleanup();
        vi.clearAllMocks();
        setTenantRead(pendingTenant);
        mocks.adminService.getTenants.mockResolvedValue({ data: [pendingTenant] });
        mocks.adminService.listCompanyRegistrationDrafts.mockResolvedValue({ data: [] });
        renderAdminRoute('/admin/tenants', profile({ permissions: ['admin.tenants'] }));
        const cardHeading = await screen.findByRole('heading', { name: 'North Market' });
        const card = cardHeading.closest('[id^="tenant-"]');
        expect(within(card).queryByRole('button', { name: /^Approve$/i })).toBeNull();
        expect(within(card).getByRole('link', { name: 'Lifecycle' })).toBeTruthy();
    });

    it('requires an applicant-visible reason for rejection and sends the trimmed value', async () => {
        setTenantRead(tenantFactory({ status: 'pending', registration_action: { action: 'approve', allowed: true, helper_text: 'Approve the public registration.' } }));
        const user = userEvent.setup();
        renderAdminRoute('/admin/tenants/tenant-1/lifecycle');
        await user.click(await screen.findByRole('button', { name: 'Reject' }));
        const dialog = await screen.findByRole('dialog', { name: 'Reject tenant registration?' });
        const rejectButton = within(dialog).getByRole('button', { name: 'Reject tenant' });
        expect(rejectButton.disabled).toBe(true);
        await user.type(within(dialog).getByLabelText(/Reason shown to the applicant/), '  Duplicate application  ');
        expect(rejectButton.disabled).toBe(false);
        await user.click(rejectButton);
        await waitFor(() => expect(mocks.adminService.rejectTenant).toHaveBeenCalledExactlyOnceWith('tenant-1', 'Duplicate application'));
    });

    it('retries only when server eligibility allows it and keeps invoice creation separate', async () => {
        const pending = tenantFactory({
            status: 'pending',
            registrationApplication: { id: 'application-1', review_status: 'approved', provisioning_status: 'failed' },
            registration_action: { action: 'retry', allowed: true, helper_text: 'Retry the failed tenant setup.' }
        });
        setTenantRead(pending);
        const user = userEvent.setup();
        renderAdminRoute('/admin/tenants/tenant-1/lifecycle');
        await user.click(await screen.findByRole('button', { name: 'Retry setup' }));
        const dialog = await screen.findByRole('dialog', { name: 'Retry tenant setup?' });
        await user.click(within(dialog).getByRole('button', { name: 'Retry setup' }));
        await waitFor(() => expect(mocks.adminService.retryTenantProvisioning).toHaveBeenCalledExactlyOnceWith('tenant-1'));
        expect((await screen.findByRole('link', { name: 'Open invoices' })).getAttribute('href')).toBe('/admin/invoices?tenant_id=tenant-1&registration_application_id=application-1');
    });

    it('polls provisioning status from the lifecycle detail route', async () => {
        setTenantRead(tenantFactory({ registrationApplication: { provisioning_status: 'in_progress' } }));
        vi.useFakeTimers();
        renderAdminRoute('/admin/tenants/tenant-1/lifecycle');

        await act(async () => {
            await vi.advanceTimersByTimeAsync(0);
        });
        expect(mocks.adminService.getTenant).toHaveBeenCalledTimes(1);

        await act(async () => {
            await vi.advanceTimersByTimeAsync(3000);
        });
        expect(mocks.adminService.getTenant).toHaveBeenCalledTimes(2);
        expect(mocks.adminService.getTenant).toHaveBeenLastCalledWith('tenant-1');
        vi.useRealTimers();
    });

    it('updates status through the existing status-only payload', async () => {
        const user = userEvent.setup();
        renderAdminRoute('/admin/tenants/tenant-1/lifecycle');
        await user.click(await screen.findByRole('button', { name: 'Edit status' }));
        const dialog = await screen.findByRole('dialog', { name: 'Edit tenant status' });
        await user.selectOptions(within(dialog).getByLabelText('Status'), 'inactive');
        await user.click(within(dialog).getByRole('button', { name: 'Save status' }));
        await waitFor(() => expect(mocks.adminService.updateTenant).toHaveBeenCalledExactlyOnceWith('tenant-1', { status: 'inactive' }));
    });

    it('requires the exact tenant name before deletion and never adds a force flag', async () => {
        const user = userEvent.setup();
        renderAdminRoute('/admin/tenants/tenant-1/lifecycle?status=active');
        await user.click(await screen.findByRole('button', { name: 'Delete tenant' }));
        const dialog = await screen.findByRole('dialog', { name: 'Permanently delete tenant?' });
        const deleteButton = within(dialog).getByRole('button', { name: 'Permanently delete' });
        expect(deleteButton.disabled).toBe(true);
        await user.type(within(dialog).getByLabelText(/Type North Market to confirm/), 'North Market');
        expect(deleteButton.disabled).toBe(false);
        await user.click(deleteButton);
        await waitFor(() => expect(mocks.adminService.deleteTenant).toHaveBeenCalledExactlyOnceWith('tenant-1'));
    });

    it('reactivates an inactive tenant through its separate lifecycle action', async () => {
        setTenantRead(tenantFactory({ status: 'inactive' }));
        const user = userEvent.setup();
        renderAdminRoute('/admin/tenants/tenant-1/lifecycle');
        await user.click(await screen.findByRole('button', { name: 'Reactivate' }));
        const dialog = await screen.findByRole('dialog', { name: 'Reactivate tenant?' });
        await user.click(within(dialog).getByRole('button', { name: 'Reactivate' }));
        await waitFor(() => expect(mocks.adminService.adminReactivateTenant).toHaveBeenCalledExactlyOnceWith('tenant-1'));
    });

    it('requires the existing owner grants, previews assignment, and deliberately sends force true with a reason', async () => {
        mocks.adminService.listDgfyAccounts.mockResolvedValue({ data: { accounts: [
            { id: 'account-new', first_name: 'Ari', last_name: 'Santos', email: 'ari@example.test', is_active: true }
        ] } });
        const user = userEvent.setup();
        renderAdminRoute('/admin/tenants/tenant-1');
        expect(await screen.findByRole('heading', { name: 'North Market' })).toBeTruthy();
        await user.selectOptions(await screen.findByLabelText('Active DGFY account'), 'account-new');
        await user.type(screen.getByLabelText('Audit reason'), 'Owner confirmed transfer');
        await user.click(screen.getByLabelText(/I understand this explicitly force-assigns/));
        await user.click(screen.getByRole('button', { name: 'Review owner assignment' }));
        const dialog = await screen.findByRole('dialog', { name: 'Confirm company owner assignment' });
        expect(within(dialog).getByText('Ari Santos (account-new)')).toBeTruthy();
        await user.click(within(dialog).getByRole('button', { name: 'Force assign owner' }));
        await waitFor(() => expect(mocks.adminService.assignTenantOwner).toHaveBeenCalledWith('tenant-1', {
            dgfy_account_id: 'account-new', reason: 'Owner confirmed transfer', force: true
        }));
    });

    it('renders private registration evidence as labeled values and keeps archived uploads read-only for writes', async () => {
        const archived = tenantFactory({ status: 'archived' });
        setTenantRead(archived);
        mocks.adminService.getTenantRegistration.mockResolvedValue({ data: {
            review_status: 'pending', provisioning_status: 'not_started', current_attempt_no: 1,
            submission_snapshot: {
                company_name: 'North Market', business_type: 'Restaurant', industry_tag: 'Food & Beverage',
                storefront_profile: { phone: '0917 123 4567' }, location: { city: 'Iloilo City' },
                hours: [{ day: 'Monday', open: '09:00', close: '18:00' }]
            },
            legal_terms_snapshot: { accepted_company_terms: true, accepted_marketplace_terms: true, acknowledgement_text: 'Both terms accepted.' },
            uploads: [{ id: 'upload-1', asset_kind: 'menu', original_filename: 'menu.png', mime_type: 'image/png', review_status: 'pending' }]
        } });
        renderAdminRoute('/admin/tenants/tenant-1/registration');
        expect(await screen.findByText('Food & Beverage')).toBeTruthy();
        expect(screen.getByText('Monday: 09:00–18:00')).toBeTruthy();
        expect(screen.getByText('Both terms accepted.')).toBeTruthy();
        expect(screen.getByText(/Menu or catalog/)).toBeTruthy();
        expect(screen.getByRole('button', { name: 'Preview' }).disabled).toBe(false);
        expect(screen.getByRole('button', { name: 'Revoke' }).disabled).toBe(true);
        expect(screen.queryByText(/"company_name"/)).toBeNull();
    });

    it('keeps successful compliance panels visible when audit loading fails and uses server eligibility for mode actions', async () => {
        const compliant = tenantFactory({
            admin_compliance_mode_action: { action: 'force_non_compliant', allowed: false, label: 'Force non-compliant', helper_text: 'Server policy blocks this action.' }
        });
        setTenantRead(compliant);
        mocks.adminService.listTenantComplianceArtifacts.mockResolvedValue({ data: { artifacts: [{ tenant_compliance_artifact_id: 'artifact-1', artifact_name: 'Permit', verification_status: 'pending_review' }] } });
        mocks.adminService.listTenantComplianceAuditLogs.mockRejectedValue(new Error('audit unavailable'));
        mocks.adminService.getTenantComplianceChecklist.mockResolvedValue({ data: {
            ready_for_compliant_activation: false,
            activation_blockers: [{ message: 'Fiscal checklist incomplete.' }],
            section_progress: { artifacts: { status: 'in_progress', complete: 1, total: 2 } }
        } });
        const user = userEvent.setup();
        renderAdminRoute('/admin/tenants/tenant-1/compliance');
        expect(await screen.findByText('Permit')).toBeTruthy();
        expect(screen.getByText('Activation readiness:')).toBeTruthy();
        expect(screen.getByText('Fiscal checklist incomplete.')).toBeTruthy();
        expect(screen.getByText('1 of 2 complete')).toBeTruthy();
        expect(screen.getByRole('alert').textContent).toContain('audit unavailable');
        const modeButton = screen.getByRole('button', { name: 'Force non-compliant' });
        expect(modeButton.disabled).toBe(true);
        await user.click(modeButton);
        expect(mocks.adminService.forceTenantNonCompliant).not.toHaveBeenCalled();
        await user.selectOptions(screen.getByLabelText('Review filter'), 'verified');
        expect(screen.queryByText('Permit')).toBeNull();
    });

    it('renders incident dispatch evidence, filters audit events, and uses incident_id for actions', async () => {
        mocks.adminService.listTenantComplianceSecurityIncidents.mockResolvedValue({ data: { incidents: [{
            incident_id: 'incident-123', status: 'new', signal_code: 'risk_signal', severity: 'warning',
            dispatch: { delivery_status: 'failed', channel: 'email', target_configured: false, dispatch_reference: 'dispatch-9', error: 'Mailbox unavailable' }
        }] } });
        mocks.adminService.listTenantComplianceAuditLogs.mockResolvedValue({ data: { logs: [
            { event_type: 'security_signal', decision: 'recorded', reason_code: 'risk_signal' },
            { event_type: 'artifact_verification', decision: 'verified', reason_code: 'manual_review' }
        ] } });
        const user = userEvent.setup();
        renderAdminRoute('/admin/tenants/tenant-1/compliance');
        expect(await screen.findByText(/Dispatch: failed via email/)).toBeTruthy();
        expect(screen.getByText('Dispatch target is not configured for this channel.')).toBeTruthy();
        expect(screen.getByText('Dispatch reference: dispatch-9')).toBeTruthy();
        expect(screen.getByText('Dispatch error: Mailbox unavailable')).toBeTruthy();
        await user.selectOptions(screen.getByLabelText('Filter compliance audit history'), 'security');
        expect(screen.getByText('security signal')).toBeTruthy();
        expect(screen.queryByText('artifact verification')).toBeNull();
        await user.click(screen.getByRole('button', { name: 'Acknowledge' }));
        await waitFor(() => expect(mocks.adminService.acknowledgeTenantComplianceSecurityIncident).toHaveBeenCalledWith(
            'tenant-1', 'incident-123', { note: null, evidence_ref: null }
        ));
    });

    it('does not request the master-only template catalog for a delegate and moves capability controls into Access', async () => {
        renderAdminRoute('/admin/tenants/tenant-1/store-setup', profile());
        expect(await screen.findByText(/catalog is Platform Master only/)).toBeTruthy();
        expect(mocks.adminService.listStoreTemplates).not.toHaveBeenCalled();

        cleanup();
        setTenantRead(tenantFactory());
        renderAdminRoute('/admin/tenants/tenant-1/access', profile({ permissions: ['admin.tenants'] }));
        expect(await screen.findByRole('heading', { name: 'Access & storefront' })).toBeTruthy();
        expect(screen.getByRole('button', { name: 'Storefront / Maps Off' })).toBeTruthy();
        expect(screen.getByRole('button', { name: 'Audit' })).toBeTruthy();
        expect(mocks.adminService.updateTenantCapabilities).not.toHaveBeenCalled();
    });
});
