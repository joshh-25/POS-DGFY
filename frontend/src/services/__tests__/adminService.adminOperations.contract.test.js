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

Object.defineProperty(globalThis, 'document', {
  value: {
    cookie: 'sku_csrf_token=csrf-admin-contract'
  },
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
    ['getTenantPosMetadata', 'get', '/admin/tenants/tenant-1/pos-metadata', () => adminService.getTenantPosMetadata('tenant-1')],
    ['listTenantPosMetadataAuditLogs', 'get', '/admin/tenants/tenant-1/pos-metadata/audit-logs', () => adminService.listTenantPosMetadataAuditLogs('tenant-1', { limit: 10 })],
    ['updateTenantPosMetadata', 'patch', '/admin/tenants/tenant-1/pos-metadata', () => adminService.updateTenantPosMetadata('tenant-1', { pending_action: 'approve' })],
    ['createAdminProvisionedTenant', 'post', '/admin/tenants/admin-provision', () => adminService.createAdminProvisionedTenant({ name: 'QA Tenant' })],
    ['createAdminProvisionedAccountAndTenant', 'post', '/admin/tenants/admin-provision-with-account', () => adminService.createAdminProvisionedAccountAndTenant({ name: 'QA Tenant' })],
    ['assignTenantOwner', 'post', '/admin/tenants/tenant-1/owner', () => adminService.assignTenantOwner('tenant-1', { dgfy_account_id: 'acct-1', reason: 'handover' })],
    ['listStorefrontDomains', 'get', '/admin/tenants/tenant-1/storefront-domains', () => adminService.listStorefrontDomains('tenant-1')],
    ['createStorefrontDomain', 'post', '/admin/tenants/tenant-1/storefront-domains', () => adminService.createStorefrontDomain('tenant-1', { hostname: 'grandmatador.com', role: 'canonical', reason: 'pilot' })],
    ['verifyStorefrontDomain', 'post', '/admin/tenants/tenant-1/storefront-domains/domain-1/verify', () => adminService.verifyStorefrontDomain('tenant-1', 'domain-1', 'dns ready')],
    ['retryStorefrontDomain', 'post', '/admin/tenants/tenant-1/storefront-domains/domain-1/retry', () => adminService.retryStorefrontDomain('tenant-1', 'domain-1', 'retry')],
    ['makeCanonicalStorefrontDomain', 'post', '/admin/tenants/tenant-1/storefront-domains/domain-1/make-canonical', () => adminService.makeCanonicalStorefrontDomain('tenant-1', 'domain-1', 'promote')],
    ['checkStorefrontDomainDns', 'post', '/admin/tenants/tenant-1/storefront-domains/domain-1/check-dns', () => adminService.checkStorefrontDomainDns('tenant-1', 'domain-1', 'drift check')],
    ['suspendStorefrontDomain', 'post', '/admin/tenants/tenant-1/storefront-domains/domain-1/suspend', () => adminService.suspendStorefrontDomain('tenant-1', 'domain-1', 'rollback')],
    ['removeStorefrontDomain', 'delete', '/admin/tenants/tenant-1/storefront-domains/domain-1', () => adminService.removeStorefrontDomain('tenant-1', 'domain-1', 'retire')],
    ['reconcileStorefrontDomainEligibility', 'post', '/admin/tenants/tenant-1/storefront-domains/reconcile-eligibility', () => adminService.reconcileStorefrontDomainEligibility('tenant-1', 'scheduled check')],
    ['listDgfyAccounts', 'get', '/dgfy/admin/accounts', () => adminService.listDgfyAccounts({ status: 'active' })],
    ['getDgfyAccount', 'get', '/dgfy/admin/accounts/acct-1', () => adminService.getDgfyAccount('acct-1')],
    ['createDgfyAccount', 'post', '/dgfy/admin/accounts', () => adminService.createDgfyAccount({ email: 'owner@example.test' })],
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
    ['reconcileCommercePaymentSession', 'post', '/commerce-payments/admin/payment-sessions/PAY-123/reconcile', () => adminService.reconcileCommercePaymentSession('PAY-123')],
    ['retryCommercePaymentFinalization', 'post', '/commerce-payments/admin/payment-sessions/PAY-123/retry-finalization', () => adminService.retryCommercePaymentFinalization('PAY-123')]
  ])('%s sends %s %s with the admin bearer token and CSRF header for unsafe methods', async (_name, method, path, callService) => {
    mockAdminApi.onAny(path).reply((config) => {
      expect(config.method).toBe(method);
      expect(config.headers.Authorization).toBe(`Bearer ${ADMIN_TOKEN}`);
      if (['post', 'put', 'patch', 'delete'].includes(method)) {
        expect(config.headers['x-csrf-token']).toBe('csrf-admin-contract');
      } else {
        expect(config.headers['x-csrf-token']).toBeUndefined();
      }
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
