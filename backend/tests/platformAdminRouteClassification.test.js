import { resolvePlatformAdminRoutePolicy } from '../src/middleware/auth.js';

describe('Platform Admin protected-route classification', () => {
  test.each([
    ['/api/v1/admin/feedback', ['admin.feedback']],
    ['/api/v1/admin/tenants', ['admin.tenants']],
    ['/api/v1/admin/tenants/pricing', ['admin.pricing']],
    ['/api/v1/admin/tenants/id-1/owner', ['admin.tenants', 'admin.dgfy_accounts']],
    ['/api/v1/admin/tenants/admin-provision-with-account', ['admin.tenants', 'admin.dgfy_accounts']],
    ['/api/v1/dgfy/admin/accounts', ['admin.dgfy_accounts']],
    ['/api/v1/commerce-payments/admin/payment-sessions', ['admin.payments']],
    ['/api/v1/admin/invoices/eligible-applications', ['admin.invoices']]
  ])('classifies %s by its page permission', (originalUrl, permissions) => {
    expect(resolvePlatformAdminRoutePolicy({ originalUrl })).toEqual({ permissions });
  });

  test.each(['/api/v1/admin/platform-admins', '/api/v1/admin/unclassified-legacy-operation'])('makes %s master-only', (originalUrl) => {
    expect(resolvePlatformAdminRoutePolicy({ originalUrl })).toEqual({ masterOnly: true });
  });

  test.each(['/api/v1/admin/me', '/api/v1/admin/logout', '/api/v1/admin/change-password'])('allows session-only identity endpoint %s', (originalUrl) => {
    expect(resolvePlatformAdminRoutePolicy({ originalUrl })).toEqual({ permissions: [] });
  });
});
