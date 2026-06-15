import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import MockAdapter from 'axios-mock-adapter';
import * as adminService from '../adminService.js';

const sessionStorageMock = (() => {
  const store = {};
  return {
    getItem: (key) => store[key] ?? null,
    setItem: (key, value) => { store[key] = String(value); },
    removeItem: (key) => { delete store[key]; },
    clear: () => { Object.keys(store).forEach((key) => delete store[key]); }
  };
})();

Object.defineProperty(globalThis, 'sessionStorage', {
  value: sessionStorageMock,
  writable: true
});

const ADMIN_TOKEN = 'admin-contract-token';

describe('adminService admin operation contracts', () => {
  let mockAdminApi;

  beforeEach(() => {
    sessionStorage.clear();
    sessionStorage.setItem('admin_token', ADMIN_TOKEN);
    mockAdminApi = new MockAdapter(adminService.adminApi);
  });

  afterEach(() => {
    mockAdminApi.restore();
    sessionStorage.clear();
  });

  it.each([
    ['updateTenantCapabilities', 'patch', '/admin/tenants/tenant-1/capabilities', () => adminService.updateTenantCapabilities('tenant-1', { ims_enabled: true })],
    ['listTenantCapabilityAuditLogs', 'get', '/admin/tenants/tenant-1/capabilities/audit-logs', () => adminService.listTenantCapabilityAuditLogs('tenant-1', { limit: 20 })],
    ['listDgfyAccounts', 'get', '/dgfy/admin/accounts', () => adminService.listDgfyAccounts({ status: 'active' })],
    ['getDgfyAccount', 'get', '/dgfy/admin/accounts/acct-1', () => adminService.getDgfyAccount('acct-1')],
    ['updateDgfyAccountProfile', 'patch', '/dgfy/admin/accounts/acct-1/profile', () => adminService.updateDgfyAccountProfile('acct-1', { first_name: 'Ada' })],
    ['suspendDgfyAccount', 'post', '/dgfy/admin/accounts/acct-1/suspend', () => adminService.suspendDgfyAccount('acct-1', { reason: 'policy' })],
    ['reactivateDgfyAccount', 'post', '/dgfy/admin/accounts/acct-1/reactivate', () => adminService.reactivateDgfyAccount('acct-1', { reason: 'resolved' })],
    ['deleteDgfyAccount', 'delete', '/dgfy/admin/accounts/acct-1', () => adminService.deleteDgfyAccount('acct-1', { reason: 'requested' })],
    ['listCommercePaymentSessions', 'get', '/commerce-payments/admin/payment-sessions', () => adminService.listCommercePaymentSessions({ status: 'paid' })],
    ['getCommerceSettlementReport', 'get', '/commerce-payments/admin/settlement-report', () => adminService.getCommerceSettlementReport({ status: 'paid' })],
    ['getPayMongoSandboxCertification', 'get', '/commerce-payments/admin/certification/paymongo-sandbox', () => adminService.getPayMongoSandboxCertification()],
    ['listTenantPaymentAccounts', 'get', '/commerce-payments/admin/tenant-payment-accounts', () => adminService.listTenantPaymentAccounts()],
    ['upsertTenantPaymentAccount', 'put', '/commerce-payments/admin/tenants/tenant-1/payment-account', () => adminService.upsertTenantPaymentAccount('tenant-1', { onboarding_status: 'active' })],
    ['createTenantPayMongoChildAccount', 'post', '/commerce-payments/admin/tenants/tenant-1/paymongo-child-account', () => adminService.createTenantPayMongoChildAccount('tenant-1', { trade_name: 'QA Store' })],
    ['operateTenantPayMongoChildAccount', 'post', '/commerce-payments/admin/tenants/tenant-1/paymongo-child-account/sync-readiness', () => adminService.operateTenantPayMongoChildAccount('tenant-1', 'sync-readiness')],
    ['createCommercePaymentRefund', 'post', '/commerce-payments/admin/payment-sessions/PAY-123/refunds', () => adminService.createCommercePaymentRefund('PAY-123', { amount: 25 })],
    ['retryCommercePaymentFinalization', 'post', '/commerce-payments/admin/payment-sessions/PAY-123/retry-finalization', () => adminService.retryCommercePaymentFinalization('PAY-123')]
  ])('%s sends %s %s with the admin bearer token', async (_name, method, path, callService) => {
    mockAdminApi.onAny(path).reply((config) => {
      expect(config.method).toBe(method);
      expect(config.headers.Authorization).toBe(`Bearer ${ADMIN_TOKEN}`);
      return [200, { success: true, data: { ok: true } }];
    });

    await expect(callService()).resolves.toMatchObject({ success: true });
    expect(mockAdminApi.history[method]).toHaveLength(1);
  });

  it('requires admin authentication for the new operation wrappers', async () => {
    sessionStorage.clear();

    await expect(adminService.listDgfyAccounts()).rejects.toThrow('Admin authentication required');
    expect(mockAdminApi.history.get).toHaveLength(0);
  });
});
