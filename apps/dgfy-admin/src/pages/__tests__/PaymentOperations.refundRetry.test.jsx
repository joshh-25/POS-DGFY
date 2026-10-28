// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Outlet, Route, Routes } from 'react-router-dom';
import PaymentOperations from '../../../Pages/PaymentOperations.jsx';

const mocks = vi.hoisted(() => ({
  listCommerceRefunds: vi.fn(),
  retryCommercePaymentRefund: vi.fn(),
  listCommercePaymentSessions: vi.fn(),
  listTenantPaymentAccounts: vi.fn(),
  getCommerceSettlementReport: vi.fn(),
  getPayMongoSandboxCertification: vi.fn(),
  getTenants: vi.fn(),
  toastSuccess: vi.fn(),
  toastInfo: vi.fn(),
  toastError: vi.fn()
}));

vi.mock('@/services/adminService', () => ({
  listCommerceRefunds: mocks.listCommerceRefunds,
  retryCommercePaymentRefund: mocks.retryCommercePaymentRefund,
  listCommercePaymentSessions: mocks.listCommercePaymentSessions,
  listTenantPaymentAccounts: mocks.listTenantPaymentAccounts,
  getCommerceSettlementReport: mocks.getCommerceSettlementReport,
  getPayMongoSandboxCertification: mocks.getPayMongoSandboxCertification,
  getTenants: mocks.getTenants
}));

vi.mock('sonner', () => ({
  toast: { success: mocks.toastSuccess, info: mocks.toastInfo, error: mocks.toastError }
}));

const refundAttempt = (overrides = {}) => ({
  public_reference: 'CRF-ORIGINAL01',
  amount_centavos: 61700,
  status: 'failed',
  failure_code: 'PROVIDER_REFUND_FAILED',
  failure_reason: 'PayMongo could not create the original refund.',
  provider_refund_id: null,
  requested_by: 'operator@example.test',
  created_at: '2026-10-19T08:00:00.000Z',
  retry_of: null,
  has_retry: false,
  retry_child_references: [],
  retry_eligible: true,
  payment_session: {
    public_reference: 'CPS-ABC123DEF4',
    tenant_id: '550e8400-e29b-41d4-a716-446655440000',
    store_slug: 'space-bar',
    pos_transaction_id: 2749,
    status: 'refund_pending'
  },
  ...overrides
});

const renderPage = (entry = '/admin/payments', adminProfile = { username: 'pat', permissions: ['admin.tenants'] }) => render(
  <MemoryRouter initialEntries={[entry]}>
    <Routes>
      <Route element={<Outlet context={{ adminProfile }} />}>
        <Route path="/admin/payments" element={<PaymentOperations />} />
      </Route>
    </Routes>
  </MemoryRouter>
);

beforeEach(() => {
  vi.clearAllMocks();
  mocks.listCommerceRefunds.mockResolvedValue({ data: { refunds: [] } });
  mocks.retryCommercePaymentRefund.mockResolvedValue({
    data: { refund: { public_reference: 'CRF-RETRY0001', status: 'pending' } }
  });
  mocks.listCommercePaymentSessions.mockResolvedValue({ data: { payment_sessions: [] } });
  mocks.listTenantPaymentAccounts.mockResolvedValue({ data: { payment_accounts: [] } });
  mocks.getCommerceSettlementReport.mockResolvedValue({ data: { settlement_report: { rows: [], summary: {} } } });
  mocks.getPayMongoSandboxCertification.mockResolvedValue({ data: { certification: {} } });
  mocks.getTenants.mockResolvedValue({ data: [] });
});

afterEach(cleanup);

describe('Payment Operations refund retries', () => {
  it('validates tenant preselection against the authorized tenant list without submitting an action', async () => {
    mocks.getTenants.mockResolvedValue({ data: [{ id: 'tenant-42', name: 'North Market', status: 'active' }] });
    renderPage('/admin/payments?tenant_id=tenant-42');

    expect(await screen.findByText(/filtered to North Market/)).toBeTruthy();
    await waitFor(() => expect(mocks.listCommercePaymentSessions).toHaveBeenCalledWith({ tenant_id: 'tenant-42' }));
    expect(mocks.listCommercePaymentSessions).not.toHaveBeenCalledWith(expect.objectContaining({ tenant_id: 'missing-tenant' }));
    expect(mocks.retryCommercePaymentRefund).not.toHaveBeenCalled();
  });

  it('leaves invalid tenant context unset and does not fetch the tenant list without its grant', async () => {
    mocks.getTenants.mockResolvedValue({ data: [] });
    renderPage('/admin/payments?tenant_id=unavailable-tenant');
    expect(await screen.findByText(/not present in your authorized tenant list/)).toBeTruthy();
    expect(mocks.listCommercePaymentSessions).not.toHaveBeenCalledWith(expect.objectContaining({ tenant_id: 'unavailable-tenant' }));

    cleanup();
    mocks.getTenants.mockClear();
    renderPage('/admin/payments?tenant_id=unavailable-tenant', { username: 'delegate', permissions: [] });
    expect(await screen.findByText(/requires Tenant Management access/)).toBeTruthy();
    expect(mocks.getTenants).not.toHaveBeenCalled();
    expect(mocks.listCommercePaymentSessions).not.toHaveBeenCalledWith(expect.objectContaining({ tenant_id: 'unavailable-tenant' }));
  });

  it('shows Retry only for server-eligible refund attempts', async () => {
    mocks.listCommerceRefunds.mockResolvedValue({
      data: {
        refunds: [
          refundAttempt({ public_reference: 'CRF-INELIGIBLE01', retry_eligible: false }),
          refundAttempt({ public_reference: 'CRF-ELIGIBLE001', retry_eligible: true })
        ]
      }
    });

    renderPage();

    const eligibleRow = await screen.findByRole('row', { name: /CRF-ELIGIBLE001/ });
    expect(within(eligibleRow).getByRole('button', { name: /Retry/ })).toBeTruthy();
    const ineligibleRow = screen.getByRole('row', { name: /CRF-INELIGIBLE01/ });
    expect(within(ineligibleRow).queryByRole('button', { name: /Retry/ })).toBeNull();
  });

  it('requires a reason and shows the session, order, amount, original failure, and authenticated initiator', async () => {
    mocks.listCommerceRefunds.mockResolvedValue({ data: { refunds: [refundAttempt()] } });
    renderPage();

    const row = await screen.findByRole('row', { name: /CRF-ORIGINAL01/ });
    fireEvent.click(within(row).getByRole('button', { name: /Retry/ }));
    const dialog = await screen.findByRole('dialog');
    const text = dialog.textContent;
    expect(text).toContain('CPS-ABC123DEF4');
    expect(text).toContain('2749');
    expect(text).toContain('PHP 617.00');
    expect(text).toContain('CRF-ORIGINAL01');
    expect(text).toContain('PayMongo could not create the original refund.');
    expect(text).toContain('Initiated by pat at');
    expect(text).toContain('server records the authenticated actor');

    fireEvent.click(within(dialog).getByRole('button', { name: 'Retry refund' }));
    expect(await within(dialog).findByRole('alert')).toBeTruthy();
    expect(mocks.retryCommercePaymentRefund).not.toHaveBeenCalled();
  });

  it('submits only the reason and keeps the dialog open with a server conflict', async () => {
    mocks.listCommerceRefunds.mockResolvedValue({ data: { refunds: [refundAttempt()] } });
    mocks.retryCommercePaymentRefund.mockRejectedValue({
      response: { status: 409, data: { message: 'Retry the latest attempt instead.' } }
    });
    renderPage();

    const row = await screen.findByRole('row', { name: /CRF-ORIGINAL01/ });
    fireEvent.click(within(row).getByRole('button', { name: /Retry/ }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.change(within(dialog).getByLabelText(/Retry reason/), {
      target: { value: 'Provider confirmed no refund exists' }
    });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Retry refund' }));

    expect((await within(dialog).findByRole('alert')).textContent).toContain('Retry the latest attempt instead.');
    expect(mocks.retryCommercePaymentRefund).toHaveBeenCalledWith(
      'CPS-ABC123DEF4',
      'CRF-ORIGINAL01',
      { reason: 'Provider confirmed no refund exists' }
    );
    expect(mocks.retryCommercePaymentRefund.mock.calls[0][2]).not.toHaveProperty('actor');
    expect(screen.getByRole('dialog')).toBeTruthy();
  });

  it('shows a pending attempt as awaiting provider confirmation and reloads attempts and sessions', async () => {
    mocks.listCommerceRefunds.mockResolvedValue({ data: { refunds: [refundAttempt()] } });
    mocks.retryCommercePaymentRefund.mockResolvedValue({
      data: { refund: { public_reference: 'CRF-RETRY0002', status: 'pending' } }
    });
    renderPage();

    const row = await screen.findByRole('row', { name: /CRF-ORIGINAL01/ });
    fireEvent.click(within(row).getByRole('button', { name: /Retry/ }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.change(within(dialog).getByLabelText(/Retry reason/), {
      target: { value: 'Provider confirmed no refund exists' }
    });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Retry refund' }));

    await waitFor(() => expect(mocks.toastInfo).toHaveBeenCalledWith(
      'Retry CRF-RETRY0002 (pending): submitted — awaiting PayMongo confirmation.'
    ));
    expect(mocks.toastSuccess).not.toHaveBeenCalledWith(expect.stringContaining('PayMongo confirmed refund'));
    await waitFor(() => expect(mocks.listCommerceRefunds).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(mocks.listCommercePaymentSessions).toHaveBeenCalledTimes(4));
  });
});
