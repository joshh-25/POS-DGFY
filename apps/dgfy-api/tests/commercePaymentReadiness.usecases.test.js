import { jest } from '@jest/globals';
import {
  buildCreateTenantPayMongoChildAccountUseCase,
  buildOperateTenantPayMongoChildAccountUseCase,
  buildUpsertTenantPaymentAccountUseCase
} from '../src/modules/commercePayments/usecases/commercePaymentAdminUseCases.js';
import { buildHandlePayMongoCommerceWebhookUseCase } from '../src/modules/commercePayments/usecases/handlePayMongoCommerceWebhookUseCase.js';

const TENANT_ID = '550e8400-e29b-41d4-a716-446655440000';

const buildRepository = () => ({
  findTenantById: jest.fn().mockResolvedValue({ id: TENANT_ID, name: 'Tenant' }),
  upsertTenantPaymentAccount: jest.fn().mockImplementation(async (payload) => ({
    account_id: 1,
    ...payload
  })),
  createAuditLog: jest.fn().mockResolvedValue(null)
});

describe('tenant PayMongo readiness evidence', () => {
  it('rejects active readiness without PayMongo verification evidence', async () => {
    const commercePaymentRepository = buildRepository();
    const useCase = buildUpsertTenantPaymentAccountUseCase({ commercePaymentRepository });

    const result = await useCase({
      tenantId: TENANT_ID,
      payload: {
        provider_merchant_id: 'org_child',
        onboarding_status: 'active',
        qrph_enabled: true,
        split_enabled: true,
        charges_enabled: true
      }
    });

    expect(result.success).toBe(false);
    expect(result.error.code).toBe('VALIDATION_FAILED');
    expect(commercePaymentRepository.upsertTenantPaymentAccount).not.toHaveBeenCalled();
  });

  it('stores readiness evidence metadata for enabled tenant accounts', async () => {
    const commercePaymentRepository = buildRepository();
    const useCase = buildUpsertTenantPaymentAccountUseCase({ commercePaymentRepository });

    const result = await useCase({
      tenantId: TENANT_ID,
      actor: 'admin',
      payload: {
        provider_merchant_id: 'org_child',
        onboarding_status: 'active',
        wallet_status: 'enabled',
        wallet_verified_at: '2026-05-20T00:00:00.000Z',
        qrph_enabled: true,
        split_enabled: true,
        charges_enabled: true,
        verification_reference: 'PM-SBX-READY-1',
        verified_at: '2026-05-20T00:00:00.000Z'
      }
    });

    expect(result.success).toBe(true);
    expect(commercePaymentRepository.upsertTenantPaymentAccount).toHaveBeenCalledWith(expect.objectContaining({
      wallet_status: 'enabled',
      wallet_verified_at: '2026-05-20T00:00:00.000Z',
      metadata: expect.objectContaining({
        verification_reference: 'PM-SBX-READY-1',
        verified_at: '2026-05-20T00:00:00.000Z',
        verified_by: 'admin'
      })
    }));
    expect(commercePaymentRepository.createAuditLog).toHaveBeenCalled();
  });

  it('rejects split readiness without enabled-wallet evidence', async () => {
    const commercePaymentRepository = buildRepository();
    const useCase = buildUpsertTenantPaymentAccountUseCase({ commercePaymentRepository });

    const result = await useCase({
      tenantId: TENANT_ID,
      actor: 'admin',
      payload: {
        provider_merchant_id: 'org_child',
        onboarding_status: 'active',
        wallet_status: 'closed_loop',
        qrph_enabled: true,
        split_enabled: true,
        charges_enabled: true,
        verification_reference: 'PM-SBX-READY-1',
        verified_at: '2026-05-20T00:00:00.000Z'
      }
    });

    expect(result.success).toBe(false);
    expect(result.error.message).toBe('PayMongo enabled wallet evidence is required before enabling split or charge settlement');
    expect(commercePaymentRepository.upsertTenantPaymentAccount).not.toHaveBeenCalled();
  });

  it('creates a PayMongo child merchant as pending readiness with the fee contract snapshot', async () => {
    const commercePaymentRepository = {
      ...buildRepository(),
      findTenantPaymentAccount: jest.fn().mockResolvedValue(null)
    };
    const paymongoService = {
      createChildMerchant: jest.fn().mockResolvedValue({
        id: 'org_child_123',
        attributes: {
          status: 'pending',
          wallet_status: 'unknown',
          onboarding_url: 'https://paymongo.test/onboard/org_child_123'
        }
      })
    };
    const useCase = buildCreateTenantPayMongoChildAccountUseCase({
      commercePaymentRepository,
      paymongoService
    });

    const result = await useCase({
      tenantId: TENANT_ID,
      payload: { trade_name: 'Tenant Trade' },
      actor: 'platform-admin'
    });

    expect(result.success).toBe(true);
    expect(paymongoService.createChildMerchant).toHaveBeenCalledWith(expect.objectContaining({
      tradeName: 'Tenant Trade',
      type: 'merchant',
      metadata: expect.objectContaining({ tenant_id: TENANT_ID })
    }));
    expect(commercePaymentRepository.upsertTenantPaymentAccount).toHaveBeenCalledWith(expect.objectContaining({
      tenant_id: TENANT_ID,
      provider_merchant_id: 'org_child_123',
      onboarding_status: 'pending',
      qrph_enabled: false,
      split_enabled: false,
      charges_enabled: false,
      metadata: expect.objectContaining({
        fee_contract: {
          dgfy_fee_basis: 'subtotal',
          dgfy_fee_charged_to: 'customer',
          provider_fee_shoulder: 'tenant_company'
        }
      })
    }));
  });

  it('activates QR Ph from PayMongo merchant lifecycle webhooks without inventing wallet or split evidence', async () => {
    const commercePaymentRepository = {
      findTenantPaymentAccountByProviderMerchantId: jest.fn().mockResolvedValue({
        account_id: 1,
        tenant_id: TENANT_ID,
        provider: 'paymongo',
        provider_merchant_id: 'org_child_123',
        wallet_status: 'unknown',
        onboarding_status: 'pending',
        qrph_enabled: false,
        split_enabled: false,
        charges_enabled: false,
        metadata: {
          fee_contract: {
            provider_fee_shoulder: 'tenant_company'
          }
        }
      }),
      upsertTenantPaymentAccount: jest.fn().mockImplementation(async (payload) => ({
        account_id: 1,
        ...payload
      })),
      createAuditLog: jest.fn().mockResolvedValue(null)
    };
    const useCase = buildHandlePayMongoCommerceWebhookUseCase({
      commercePaymentRepository,
      paymongoService: { verifyWebhookSignature: jest.fn().mockReturnValue(true) },
      logger: { warn: jest.fn(), error: jest.fn() }
    });

    const result = await useCase({
      headers: { 'paymongo-event-id': 'evt_account_activated' },
      rawBody: '{"data":{"attributes":{"type":"merchant.activated"}}}',
      body: {
        data: {
          id: 'evt_account_activated',
          attributes: {
            type: 'merchant.activated',
            data: {
              id: 'org_child_123',
              attributes: { status: 'activated' }
            }
          }
        }
      }
    });

    expect(result.success).toBe(true);
    expect(commercePaymentRepository.upsertTenantPaymentAccount).toHaveBeenCalledWith(expect.objectContaining({
      tenant_id: TENANT_ID,
      provider_merchant_id: 'org_child_123',
      onboarding_status: 'active',
      wallet_status: 'unknown',
      qrph_enabled: true,
      split_enabled: false,
      charges_enabled: false,
      metadata: expect.objectContaining({
        verification_reference: 'evt_account_activated',
        verified_by: 'paymongo_webhook',
        wallet_evidence_detected: false,
        split_evidence_detected: false,
        charge_evidence_detected: false
      })
    }));
  });

  it('syncs PayMongo child account provider actions while enabling split only with explicit wallet and split evidence', async () => {
    const commercePaymentRepository = {
      findTenantPaymentAccount: jest.fn().mockResolvedValue({
        account_id: 1,
        tenant_id: TENANT_ID,
        provider: 'paymongo',
        provider_merchant_id: 'org_child_123',
        wallet_status: 'unknown',
        onboarding_status: 'pending',
        qrph_enabled: false,
        split_enabled: false,
        charges_enabled: false,
        metadata: {}
      }),
      upsertTenantPaymentAccount: jest.fn().mockImplementation(async (payload) => ({
        account_id: 1,
        ...payload
      })),
      createAuditLog: jest.fn().mockResolvedValue(null)
    };
    const paymongoService = {
      activateAccount: jest.fn().mockResolvedValue({
        id: 'org_child_123',
        attributes: {
          status: 'activated',
          wallet_status: 'enabled',
          capabilities: {
            split_payments: 'active',
            payments: 'active'
          }
        }
      })
    };
    const useCase = buildOperateTenantPayMongoChildAccountUseCase({
      commercePaymentRepository,
      paymongoService
    });

    const result = await useCase({
      tenantId: TENANT_ID,
      action: 'activate',
      actor: 'platform-admin'
    });

    expect(result.success).toBe(true);
    expect(commercePaymentRepository.upsertTenantPaymentAccount).toHaveBeenCalledWith(expect.objectContaining({
      onboarding_status: 'active',
      qrph_enabled: true,
      wallet_status: 'enabled',
      split_enabled: true,
      charges_enabled: true,
      metadata: expect.objectContaining({
        verification_reference: 'org_child_123',
        verified_by: 'platform-admin',
        last_provider_action: 'activate'
      })
    }));
  });

  it('does not enable charge readiness from provider capability evidence without enabled-wallet evidence', async () => {
    const commercePaymentRepository = {
      findTenantPaymentAccount: jest.fn().mockResolvedValue({
        account_id: 1,
        tenant_id: TENANT_ID,
        provider: 'paymongo',
        provider_merchant_id: 'org_child_123',
        wallet_status: 'unknown',
        onboarding_status: 'pending',
        qrph_enabled: false,
        split_enabled: false,
        charges_enabled: false,
        metadata: {}
      }),
      upsertTenantPaymentAccount: jest.fn().mockImplementation(async (payload) => ({
        account_id: 1,
        ...payload
      })),
      createAuditLog: jest.fn().mockResolvedValue(null)
    };
    const paymongoService = {
      activateAccount: jest.fn().mockResolvedValue({
        id: 'org_child_123',
        attributes: {
          status: 'activated',
          wallet_status: 'closed_loop',
          capabilities: {
            payments: 'active'
          }
        }
      })
    };
    const useCase = buildOperateTenantPayMongoChildAccountUseCase({
      commercePaymentRepository,
      paymongoService
    });

    const result = await useCase({
      tenantId: TENANT_ID,
      action: 'activate',
      actor: 'platform-admin'
    });

    expect(result.success).toBe(true);
    expect(commercePaymentRepository.upsertTenantPaymentAccount).toHaveBeenCalledWith(expect.objectContaining({
      onboarding_status: 'active',
      qrph_enabled: true,
      wallet_status: 'closed_loop',
      split_enabled: false,
      charges_enabled: false
    }));
  });
});
