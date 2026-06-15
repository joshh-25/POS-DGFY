import { jest } from '@jest/globals';
import { buildGetCommerceSettlementReportUseCase } from '../src/modules/commercePayments/usecases/commercePaymentAdminUseCases.js';
import { buildGetPayMongoSandboxCertificationUseCase } from '../src/modules/commercePayments/usecases/paymongoSandboxCertificationUseCase.js';

const TENANT_ID = '550e8400-e29b-41d4-a716-446655440000';

describe('commerce payment settlement reporting', () => {
  it('summarizes DGFY fixed split, tenant gross estimate, refunds, and variance', async () => {
    const useCase = buildGetCommerceSettlementReportUseCase({
      commercePaymentRepository: {
        listSessions: jest.fn().mockResolvedValue([{
          session_id: 1,
          public_reference: 'CPS-SETTLE001',
          tenant_id: TENANT_ID,
          store_slug: 'demo',
          target_type: 'store_checkout',
          status: 'partial_refunded',
          total_amount_centavos: 10000,
          platform_fee_centavos: 100,
          fee_policy: {
            dgfy_fee_basis: 'subtotal',
            dgfy_fee_charged_to: 'customer',
            provider_fee_shoulder: 'tenant_company'
          },
          tenant_transfer_merchant_id: 'org_child',
          provider_payment_id: 'pay_123'
        }]),
        listRefundsBySession: jest.fn().mockResolvedValue([
          { refund_id: 10, public_reference: 'CRF-1', status: 'succeeded', amount_centavos: 2500 },
          { refund_id: 11, public_reference: 'CRF-2', status: 'pending', amount_centavos: 1000 }
        ])
      }
    });

    const result = await useCase({ query: {} });

    expect(result.success).toBe(true);
    expect(result.data.settlement_report.summary).toEqual(expect.objectContaining({
      session_count: 1,
      total_amount_centavos: 10000,
      platform_fee_centavos: 100,
      estimated_tenant_gross_centavos: 9900,
      succeeded_refund_centavos: 2500,
      pending_refund_centavos: 1000,
      reconciliation_variance_centavos: 0
    }));
    expect(result.data.settlement_report.rows[0]).toEqual(expect.objectContaining({
      payment_session_id: 'CPS-SETTLE001',
      fee_policy: expect.objectContaining({ provider_fee_shoulder: 'tenant_company' }),
      net_after_succeeded_refunds_centavos: 7500
    }));
  });
});

describe('paymongo sandbox certification checks', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('reports config and non-automatable child merchant evidence separately', async () => {
    process.env.PAYMONGO_TEST_SECRET_KEY = 'sk_test';
    process.env.PAYMONGO_TEST_PUBLIC_KEY = 'pk_test';
    process.env.PAYMONGO_TEST_WEBHOOK_SECRET = 'whsec_test';
    process.env.PAYMONGO_DGFY_MERCHANT_ID = 'org_parent';
    process.env.PAYMONGO_MODE = 'test';
    const paymongoService = {
      verifyWebhookSignature: jest.fn().mockReturnValue(true)
    };
    const commercePaymentRepository = {
      listTenantPaymentAccounts: jest.fn().mockResolvedValue([{
        tenant_id: TENANT_ID,
        onboarding_status: 'active',
        qrph_enabled: true,
        split_enabled: true,
        charges_enabled: true,
        wallet_status: 'enabled',
        wallet_verified_at: '2026-05-20T00:00:00.000Z',
        metadata: {
          verification_reference: 'PM-SBX-READY',
          verified_at: '2026-05-20T00:00:00.000Z'
        }
      }])
    };
    const useCase = buildGetPayMongoSandboxCertificationUseCase({ paymongoService, commercePaymentRepository });

    const result = await useCase();

    expect(result.success).toBe(true);
    expect(result.data.certification.certified).toBe(true);
    expect(result.data.certification.checks).toEqual(expect.arrayContaining([
      expect.objectContaining({ key: 'webhook_signature_verification', passed: true }),
      expect.objectContaining({ key: 'manual_child_merchant_verification_required', passed: false, severity: 'warning' }),
      expect.objectContaining({ key: 'child_account_webhook_registration_required', passed: false, severity: 'warning' }),
      expect.objectContaining({ key: 'tenant_readiness_evidence', passed: true }),
      expect.objectContaining({ key: 'tenant_wallet_evidence', passed: true })
    ]));
  });
});
