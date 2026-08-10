import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from '@jest/globals';

const routeSource = readFileSync(resolve(process.cwd(), 'src/routes/commercePayments.js'), 'utf8');

describe('commerce payment reconciliation route contract', () => {
  it('keeps provider reconciliation admin-only and validates the payment-session reference', () => {
    expect(routeSource).toContain(
      "router.post('/admin/payment-sessions/:payment_session_id/reconcile', setNoStoreCacheControl, authenticateAdmin, validateCommercePaymentSessionParam, reconcilePaymentSession);"
    );
  });
});
