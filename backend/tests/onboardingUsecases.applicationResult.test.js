import { jest } from '@jest/globals';
import {
  buildGetOnboardingStatusUseCase,
  buildSaveOnboardingStepUseCase,
  buildCompleteOnboardingUseCase
} from '../src/modules/onboarding/usecases/onboardingUseCases.js';
import { DomainErrorCode } from '../src/modules/shared/contracts/domainErrors.js';

describe('onboarding use-cases application result contract', () => {
  it('getOnboardingStatus returns success envelope', async () => {
    const useCase = buildGetOnboardingStatusUseCase({
      onboardingRepository: {
        getStatus: jest.fn().mockResolvedValue({ tenant_onboarding_state: 'not_started' })
      }
    });

    const result = await useCase();
    expect(result.success).toBe(true);
    expect(result.data.tenant_onboarding_state).toBe('not_started');
  });

  it('saveOnboardingStep validates step key', async () => {
    const useCase = buildSaveOnboardingStepUseCase({
      onboardingRepository: {
        saveStep: jest.fn()
      }
    });

    const result = await useCase({ stepKey: '' });
    expect(result.success).toBe(false);
    expect(result.error.code).toBe(DomainErrorCode.VALIDATION_FAILED);
    expect(result.error.statusCode).toBe(422);
  });

  it('saveOnboardingStep refreshes storefront discovery when access-mode onboarding changes', async () => {
    const syncStorefrontDiscoveryWithReliability = jest.fn().mockResolvedValue({ ok: true, attempts: 1 });
    const useCase = buildSaveOnboardingStepUseCase({
      onboardingRepository: {
        saveStep: jest.fn().mockResolvedValue({ step_key: 'business_classification' })
      },
      syncStorefrontDiscoveryWithReliability
    });

    const result = await useCase({
      tenantId: 'tenant-1',
      stepKey: 'business_classification',
      payload: {
        operations: { customer_access_mode: 'inquiry' }
      }
    });

    expect(result.success).toBe(true);
    expect(syncStorefrontDiscoveryWithReliability).toHaveBeenCalledWith({
      tenantId: 'tenant-1',
      source: 'tenant_onboarding_business_classification'
    });
    expect(result.data.storefront_sync.ok).toBe(true);
  });

  it('completeOnboarding maps readiness failures', async () => {
    const useCase = buildCompleteOnboardingUseCase({
      onboardingRepository: {
        complete: jest.fn().mockRejectedValue(Object.assign(new Error('Onboarding requirements are incomplete'), {
          statusCode: 422,
          details: { missing_requirements: ['has_sellable_item'] }
        }))
      },
      syncStorefrontDiscoveryWithReliability: jest.fn()
    });

    const result = await useCase({ tenantId: 'tenant-1' });
    expect(result.success).toBe(false);
    expect(result.error.code).toBe(DomainErrorCode.VALIDATION_FAILED);
    expect(result.error.statusCode).toBe(422);
  });

  it('completeOnboarding returns storefront sync payload on success', async () => {
    const useCase = buildCompleteOnboardingUseCase({
      onboardingRepository: {
        complete: jest.fn().mockResolvedValue({ tenant_onboarding_state: 'completed' })
      },
      syncStorefrontDiscoveryWithReliability: jest.fn().mockResolvedValue({ ok: true, attempts: 1 })
    });

    const result = await useCase({ tenantId: 'tenant-1' });
    expect(result.success).toBe(true);
    expect(result.data.tenant_onboarding_state).toBe('completed');
    expect(result.data.storefront_sync.ok).toBe(true);
  });
});
