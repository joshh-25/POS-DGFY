import { jest } from '@jest/globals';
import { buildUpsertTenantPaymentAccountUseCase } from '../src/modules/commercePayments/usecases/commercePaymentAdminUseCases.js';

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
});
