import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const serverSource = readFileSync(resolve(process.cwd(), 'src/server.js'), 'utf8');
const routeSource = readFileSync(resolve(process.cwd(), 'src/routes/commercePayments.js'), 'utf8');

describe('commerce payment route mount contract', () => {
  it('mounts the commerce payment admin router on the public API version namespace', () => {
    expect(serverSource).toContain("import commercePaymentRoutes from './routes/commercePayments.js';");
    expect(serverSource).toContain("app.use('/api/v1/commerce-payments', commercePaymentRoutes);");
  });

  // Consolidated from tests/commercePaymentReconciliation.route.contract.test.js (#1441)
  it('keeps provider reconciliation admin-only and validates the payment-session reference', () => {
    expect(routeSource).toContain(
      "router.post('/admin/payment-sessions/:payment_session_id/reconcile', setNoStoreCacheControl, authenticateAdmin, validateCommercePaymentSessionParam, reconcilePaymentSession);"
    );
  });

  it('keeps refund retry admin-only and validates both public references', () => {
    expect(routeSource).toContain('validateCommercePaymentRefundRetryBody');
    expect(routeSource).toContain(
      "router.post('/admin/payment-sessions/:payment_session_id/refunds/:refund_id/retry', setNoStoreCacheControl, authenticateAdmin, validateCommercePaymentRefundParam, validateCommercePaymentRefundRetryBody, retryPaymentSessionRefund);"
    );
  });

  it('lists refund attempts behind the existing admin payment permission prefix', () => {
    expect(routeSource).toContain('validateListCommercePaymentRefundsQuery');
    expect(routeSource).toContain(
      "router.get('/admin/refunds', setNoStoreCacheControl, authenticateAdmin, validateListCommercePaymentRefundsQuery, listPaymentRefunds);"
    );
  });

  it('validates DGLaundry booking payment-session bodies before the controller', () => {
    expect(routeSource).toContain('validateCreateDglaundryBookingPaymentSessionBody');
    expect(routeSource).toContain(
      "router.post('/dglaundry/booking-groups/payment-sessions', setNoStoreCacheControl, requireTenantContext, requireStorefrontVisible('commerce-payments'), optionalStoreCustomer, validateCreateDglaundryBookingPaymentSessionBody, createDglaundryBookingPaymentSession);"
    );
  });
});
