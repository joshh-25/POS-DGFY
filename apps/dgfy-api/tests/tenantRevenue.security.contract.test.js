import fs from 'fs';
import path from 'path';
import { describe, expect, it } from '@jest/globals';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const read = (relativePath) => fs.readFileSync(path.resolve(__dirname, relativePath), 'utf8');

const routes = read('../src/routes/tenantRevenue.js');
const handlers = read('../src/modules/tenantRevenue/controllers/tenantRevenueHandlers.js');
const webhook = read(
  '../src/modules/commercePayments/usecases/handlePayMongoCommerceWebhookUseCase.js'
);
const verifiedPaidSession = read(
  '../src/modules/commercePayments/usecases/processVerifiedPaidCommerceSession.js'
);
const feature = read('../src/config/tenantRevenueFeature.js');
const productionValidation = read('../src/config/productionEnvValidation.cjs');
const cryptoService = read(
  '../src/modules/tenantRevenue/services/payoutDestinationCrypto.js'
);

describe('Tenant revenue security contracts', () => {
  it('protects tenant statements with tenant auth, report permission, and server-owned tenant isolation', () => {
    expect(routes).toContain('authenticate,');
    expect(routes).toContain('checkPermission(PERMISSIONS.REPORTS.actions.VIEW_REPORTS)');
    expect(handlers).toContain('tenant_id: tenantIdFrom(req)');
    expect(handlers.indexOf('tenant_id: tenantIdFrom(req)')).toBeGreaterThan(
      handlers.indexOf('...(req.validatedQuery || req.query || {})')
    );
  });

  it('protects all platform financial mutations behind admin auth and rate limiting', () => {
    expect(routes).toContain(
      'router.use(setNoStoreCacheControl, authenticateAdmin, tenantFinancialLimiter)'
    );
    expect(routes).toContain('financePreparer');
    expect(routes).toContain('financeApprover');
    expect(routes).toContain("'/admin/settlement-batches/:settlement_batch_id/approve'");
    expect(routes).toContain("'/admin/adjustments/:adjustment_id/approve'");
    expect(routes).toContain("'/admin/payouts/:payout_id/retry'");
  });

  it('verifies PayMongo signatures before processing revenue events', () => {
    const handlerBody = webhook.slice(webhook.indexOf('return async ({ headers'));
    const signatureVerificationIndex = handlerBody.indexOf(
      'paymongoService.verifyWebhookSignature'
    );
    const verifiedPaymentProcessingIndex = handlerBody.indexOf(
      'await processVerifiedPaidCommerceSession'
    );

    expect(signatureVerificationIndex).toBeGreaterThanOrEqual(0);
    expect(verifiedPaymentProcessingIndex).toBeGreaterThan(signatureVerificationIndex);
    expect(verifiedPaidSession).toContain('await postPaidTenantRevenueTransactionUseCase');
  });

  it('keeps automatic payouts independently locked and rejects split plus collect-and-settle mode', () => {
    expect(feature).toContain('tenantRevenueExternalPayoutApproved');
    expect(feature).toContain('tenantRevenueAutomaticPayoutEnabled');
    expect(feature).toContain('tenantRevenueSharingEnabled');
    expect(productionValidation).toContain(
      'TENANT_REVENUE_SHARING_ENABLED and COMMERCE_PAYMONGO_SPLIT_ENABLED cannot both be true'
    );
  });

  it('encrypts payout destinations and only exposes masked account data', () => {
    expect(cryptoService).toContain("createCipheriv('aes-256-gcm'");
    expect(cryptoService).toContain('maskPayoutDestination');
    expect(cryptoService).not.toContain('PAYMONGO_SECRET_KEY');
  });
});
