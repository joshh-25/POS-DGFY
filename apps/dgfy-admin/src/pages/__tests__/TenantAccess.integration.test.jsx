/** @vitest-environment jsdom */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import TenantAccess from '../../../Pages/TenantAccess.jsx';
import TenantDetailLayout from '../../../Pages/TenantDetailLayout.jsx';

const mocks = vi.hoisted(() => ({
  adminServiceMock: {
    getTenant: vi.fn(),
    updateTenantCapabilities: vi.fn(),
    listTenantCapabilityAuditLogs: vi.fn()
  },
  toastMock: { success: vi.fn(), error: vi.fn() }
}));

vi.mock('@/services/adminService', () => mocks.adminServiceMock);
vi.mock('sonner', () => ({ toast: mocks.toastMock }));

describe('TenantAccess capability controls', () => {
  const kusinaTenant = {
    id: 'tenant-kusina',
    name: 'Kusina & Cafe',
    status: 'active',
    capabilities: {
      ims_enabled: true,
      pos_enabled: false,
      storefront_visible: true,
      storefront_readiness: { publishable: false },
      store_visibility_merchant_editable: true,
      downpayment_allowed: false,
      customer_access_mode: 'transaction',
      requested_customer_access_mode: 'transaction',
      effective_customer_access_mode: 'catalog',
      max_customer_access_mode: 'catalog',
      platform_max_customer_access_mode: 'transaction',
      registration_stage_max_customer_access_mode: 'catalog',
      registration_stage: 'informal',
      customer_access_limitation_reason: 'Registration stage informal allows up to catalog mode.'
    }
  };
  const kateTenant = {
    id: 'tenant-kate',
    name: 'Kate Store',
    status: 'active',
    capabilities: {
      ims_enabled: true,
      pos_enabled: true,
      storefront_visible: false,
      storefront_readiness: { publishable: false },
      store_visibility_merchant_editable: true,
      downpayment_allowed: false,
      customer_access_mode: 'ghost',
      requested_customer_access_mode: 'ghost',
      effective_customer_access_mode: 'ghost',
      max_customer_access_mode: 'ghost',
      platform_max_customer_access_mode: 'transaction',
      registration_stage_max_customer_access_mode: 'catalog',
      registration_stage: 'informal'
    }
  };
  const withCapabilities = (tenant, capabilities) => ({
    ...tenant,
    capabilities: { ...tenant.capabilities, ...capabilities }
  });

  const renderAccess = (tenant = kusinaTenant) => {
    mocks.adminServiceMock.getTenant.mockResolvedValue({ data: tenant });
    return render(
      <MemoryRouter initialEntries={[`/admin/tenants/${tenant.id}/access?status=active`]}>
        <Routes>
          <Route path="/admin/tenants/:id" element={<TenantDetailLayout />}>
            <Route path="access" element={<TenantAccess />} />
          </Route>
        </Routes>
      </MemoryRouter>
    );
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.adminServiceMock.getTenant.mockResolvedValue({ data: kusinaTenant });
    mocks.adminServiceMock.updateTenantCapabilities.mockResolvedValue({ success: true });
    mocks.adminServiceMock.listTenantCapabilityAuditLogs.mockResolvedValue({
      data: {
        logs: [{
          id: 10,
          actor_username: 'skupervisor',
          reason: 'Tenant requested POS restoration',
          created_at: '2026-06-07T03:00:00.000Z',
          before_snapshot: { pos_enabled: false },
          after_snapshot: { pos_enabled: true }
        }]
      }
    });
  });

  afterEach(cleanup);

  it('renders the targeted tenant capability and readiness details', async () => {
    renderAccess();

    await screen.findByRole('heading', { name: 'Kusina & Cafe' });
    expect(screen.getByRole('heading', { name: 'Access & storefront' })).toBeTruthy();
    expect(screen.getByRole('region', { name: 'Core workspace access' })).toBeTruthy();
    expect(screen.getByRole('region', { name: 'Public storefront controls' })).toBeTruthy();
    expect(screen.getByText('Needs primary map pin')).toBeTruthy();
    expect(screen.getByText('Requested: Online ordering mode')).toBeTruthy();
    expect(screen.getByText(/Effective: Catalog only \/ Max: Catalog only/i)).toBeTruthy();
    expect(screen.getByText(/Platform max: Online ordering mode \/ Registration max: Catalog only/i)).toBeTruthy();
    expect(screen.getByText('Registration stage informal allows up to catalog mode.')).toBeTruthy();
  });

  it('updates capability switches with a reason and verifies the targeted read-back', async () => {
    const user = userEvent.setup();
    renderAccess();

    await screen.findByRole('heading', { name: 'Kusina & Cafe' });
    await user.click(screen.getByRole('button', { name: 'POS Off' }));
    await screen.findByText('Confirm capability change');
    expect(screen.getByText(/POS access will be restored for this company/)).toBeTruthy();
    mocks.adminServiceMock.getTenant.mockResolvedValueOnce({
      data: withCapabilities(kusinaTenant, { pos_enabled: true })
    });
    await user.type(screen.getByLabelText('Reason'), 'Tenant requested POS restoration');
    await user.click(screen.getByRole('button', { name: 'Apply change' }));

    await waitFor(() => expect(mocks.adminServiceMock.updateTenantCapabilities).toHaveBeenCalledWith(
      'tenant-kusina', { pos_enabled: true, reason: 'Tenant requested POS restoration' }
    ));
    expect(mocks.adminServiceMock.getTenant).toHaveBeenCalledWith('tenant-kusina');
    await waitFor(() => expect(mocks.toastMock.success).toHaveBeenCalledWith('Tenant capabilities updated'));
  });

  it('updates platform max and registration readiness as distinct audited capability patches', async () => {
    const user = userEvent.setup();
    renderAccess();
    await screen.findByRole('heading', { name: 'Kusina & Cafe' });

    await user.selectOptions(screen.getByLabelText('Platform max allowed for Kusina & Cafe'), 'catalog');
    await screen.findByText('Confirm capability change');
    expect(screen.getByText(/Platform will cap this tenant at Catalog only/i)).toBeTruthy();
    await user.type(screen.getByLabelText('Reason'), 'Platform reviewed storefront readiness cap');
    await user.click(screen.getByRole('button', { name: 'Apply change' }));
    await waitFor(() => expect(mocks.adminServiceMock.updateTenantCapabilities).toHaveBeenCalledWith(
      'tenant-kusina', { platform_max_customer_access_mode: 'catalog', reason: 'Platform reviewed storefront readiness cap' }
    ));

    mocks.adminServiceMock.getTenant.mockResolvedValueOnce({
      data: withCapabilities(kusinaTenant, { registration_stage: 'registered' })
    });
    await user.selectOptions(screen.getByLabelText('Registration readiness for Kusina & Cafe'), 'registered');
    await screen.findByText('Confirm capability change');
    expect(screen.getByText(/Checkout can become available when company requested mode and platform max are also Online ordering mode/i)).toBeTruthy();
    await user.clear(screen.getByLabelText('Reason'));
    await user.type(screen.getByLabelText('Reason'), 'Approved registration evidence for online ordering');
    await user.click(screen.getByRole('button', { name: 'Apply change' }));
    await waitFor(() => expect(mocks.adminServiceMock.updateTenantCapabilities).toHaveBeenLastCalledWith(
      'tenant-kusina', { customer_access_registration_stage: 'registered', reason: 'Approved registration evidence for online ordering' }
    ));
  });

  it('keeps storefront sub-modes disabled until Storefront Maps is visible', async () => {
    renderAccess(kateTenant);

    await screen.findByRole('heading', { name: 'Kate Store' });
    expect(screen.getByText('Hidden from maps')).toBeTruthy();
    expect(screen.getByText('Turn on Storefront / Maps before changing the customer-facing sub-mode.')).toBeTruthy();
    expect(screen.getByRole('button', { name: /Map listing only/i }).disabled).toBe(true);
    expect(screen.getByRole('button', { name: 'Storefront / Maps Off' }).disabled).toBe(false);
  });

  it('saves Storefront / Maps only after its audit reason and verified read-back', async () => {
    const user = userEvent.setup();
    renderAccess(kateTenant);
    await screen.findByRole('heading', { name: 'Kate Store' });

    await user.click(screen.getByRole('button', { name: 'Storefront / Maps Off' }));
    await screen.findByText('Confirm capability change');
    expect(screen.getByText(/Storefront \/ Maps visibility will be restored after the audit reason is saved/i)).toBeTruthy();
    mocks.adminServiceMock.getTenant.mockResolvedValueOnce({
      data: withCapabilities(kateTenant, { storefront_visible: true })
    });
    await user.type(screen.getByLabelText('Reason'), 'Merchant requested public storefront launch');
    await user.click(screen.getByRole('button', { name: 'Apply change' }));

    await waitFor(() => expect(mocks.adminServiceMock.updateTenantCapabilities).toHaveBeenCalledWith(
      'tenant-kate', { storefront_visible: true, reason: 'Merchant requested public storefront launch' }
    ));
    await waitFor(() => expect(mocks.toastMock.success).toHaveBeenCalledWith('Tenant capabilities updated'));
    expect(screen.queryByText('Confirm capability change')).toBeNull();
  });

  it('preserves admin visibility control when merchant edits are locked', async () => {
    const user = userEvent.setup();
    renderAccess(kateTenant);
    await screen.findByRole('heading', { name: 'Kate Store' });

    mocks.adminServiceMock.getTenant.mockResolvedValueOnce({
      data: withCapabilities(kateTenant, { store_visibility_merchant_editable: false })
    });
    await user.click(screen.getByRole('button', { name: 'Merchant can edit storefront visibility On' }));
    await screen.findByText('Confirm capability change');
    await user.type(screen.getByLabelText('Reason'), 'Platform manages this tenant visibility');
    await user.click(screen.getByRole('button', { name: 'Apply change' }));
    await waitFor(() => expect(mocks.adminServiceMock.updateTenantCapabilities).toHaveBeenCalledWith(
      'tenant-kate', { store_visibility_merchant_editable: false, reason: 'Platform manages this tenant visibility' }
    ));

    mocks.adminServiceMock.getTenant.mockResolvedValueOnce({
      data: withCapabilities(kateTenant, { store_visibility_merchant_editable: false, storefront_visible: true })
    });
    await user.click(screen.getByRole('button', { name: 'Storefront / Maps Off' }));
    await screen.findByText('Confirm capability change');
    await user.type(screen.getByLabelText('Reason'), 'Admin is publishing this store');
    await user.click(screen.getByRole('button', { name: 'Apply change' }));
    await waitFor(() => expect(mocks.adminServiceMock.updateTenantCapabilities).toHaveBeenLastCalledWith(
      'tenant-kate', { storefront_visible: true, reason: 'Admin is publishing this store' }
    ));
  });

  it('keeps downpayment as a standalone capability patch', async () => {
    const user = userEvent.setup();
    renderAccess(kateTenant);
    await screen.findByRole('heading', { name: 'Kate Store' });

    mocks.adminServiceMock.getTenant.mockResolvedValueOnce({
      data: withCapabilities(kateTenant, { downpayment_allowed: true })
    });
    await user.click(screen.getByRole('button', { name: 'Downpayment (premium) Off' }));
    await screen.findByText('Confirm capability change');
    await user.type(screen.getByLabelText('Reason'), 'Premium access approved');
    await user.click(screen.getByRole('button', { name: 'Apply change' }));

    await waitFor(() => expect(mocks.adminServiceMock.updateTenantCapabilities).toHaveBeenCalledWith(
      'tenant-kate', { downpayment_allowed: true, reason: 'Premium access approved' }
    ));
    expect(await screen.findByRole('button', { name: 'Downpayment (premium) On' })).toBeTruthy();
  });

  it('does not claim success when the fresh read does not reflect a write', async () => {
    const user = userEvent.setup();
    renderAccess();
    await screen.findByRole('heading', { name: 'Kusina & Cafe' });

    mocks.adminServiceMock.getTenant.mockResolvedValueOnce({ data: kusinaTenant });
    await user.click(screen.getByRole('button', { name: 'POS Off' }));
    await screen.findByText('Confirm capability change');
    await user.type(screen.getByLabelText('Reason'), 'Tenant requested POS restoration');
    await user.click(screen.getByRole('button', { name: 'Apply change' }));

    await waitFor(() => expect(mocks.toastMock.error).toHaveBeenCalledWith(expect.stringMatching(/does not reflect it.*pos_enabled/)));
    expect(mocks.toastMock.success).not.toHaveBeenCalledWith('Tenant capabilities updated');
    expect(screen.getByText('Confirm capability change')).toBeTruthy();
  });

  it('shows unavailable settings as unknown and keeps all writes disabled', async () => {
    const user = userEvent.setup();
    const unavailableTenant = { ...kateTenant, capabilities: { unavailable: true } };
    renderAccess(unavailableTenant);

    await screen.findByRole('heading', { name: 'Kate Store' });
    expect(screen.getByText('Settings unavailable')).toBeTruthy();
    expect(screen.getByText('Capability settings are unknown')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Storefront \/ Maps (On|Off)/ })).toBeNull();
    expect(screen.queryByText('Hidden from maps')).toBeNull();
    expect(mocks.adminServiceMock.updateTenantCapabilities).not.toHaveBeenCalled();

    mocks.adminServiceMock.getTenant.mockResolvedValueOnce({ data: kateTenant });
    await user.click(screen.getByRole('button', { name: 'Retry capability read' }));
    expect(await screen.findByRole('button', { name: 'Storefront / Maps Off' })).toBeTruthy();
  });

  it('loads and renders the recent capability audit in the detail section', async () => {
    const user = userEvent.setup();
    renderAccess();
    await screen.findByRole('heading', { name: 'Kusina & Cafe' });
    await user.click(screen.getByRole('button', { name: 'Audit' }));

    await waitFor(() => expect(mocks.adminServiceMock.listTenantCapabilityAuditLogs).toHaveBeenCalledWith(
      'tenant-kusina', { limit: 20 }
    ));
    expect(await screen.findByText('Tenant requested POS restoration')).toBeTruthy();
    expect(screen.getByText(/POS Off/i)).toBeTruthy();
    expect(screen.getByText(/POS On/i)).toBeTruthy();
  });
});
