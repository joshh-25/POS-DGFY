import { ok, fail } from '../../shared/contracts/applicationResult.js';
import { DomainError, DomainErrorCode } from '../../shared/contracts/domainErrors.js';

const mapError = (error, fallbackMessage = 'Onboarding request failed') => {
  if (!error) {
    return new DomainError(DomainErrorCode.INTERNAL_ERROR, fallbackMessage, { statusCode: 500 });
  }

  if (error instanceof DomainError) return error;

  const statusCode = Number(error.statusCode || error.status || 500);
  const message = String(error.message || fallbackMessage);

  if (statusCode === 404) {
    return new DomainError(DomainErrorCode.RESOURCE_NOT_FOUND, message, { statusCode });
  }

  if (statusCode === 400 || statusCode === 422) {
    return new DomainError(DomainErrorCode.VALIDATION_FAILED, message, {
      statusCode,
      details: error.details || null
    });
  }

  if (statusCode === 403) {
    return new DomainError(DomainErrorCode.ACCESS_DENIED, message, { statusCode });
  }

  return new DomainError(DomainErrorCode.INTERNAL_ERROR, message, {
    statusCode,
    details: error.details || null
  });
};

export const buildGetOnboardingStatusUseCase = ({ onboardingRepository }) => {
  return async ({ storeNameBaseline = '' } = {}) => {
    try {
      const status = await onboardingRepository.getStatus({ storeNameBaseline });
      return ok(status);
    } catch (error) {
      return fail(mapError(error, 'Failed to load onboarding status'));
    }
  };
};

export const buildSaveOnboardingStepUseCase = ({ onboardingRepository }) => {
  return async ({ stepKey, payload, storeNameBaseline = '' }) => {
    if (!stepKey || String(stepKey).trim().length === 0) {
      return fail(new DomainError(
        DomainErrorCode.VALIDATION_FAILED,
        'step_key is required',
        { statusCode: 422 }
      ));
    }

    try {
      const data = await onboardingRepository.saveStep({ stepKey, payload, storeNameBaseline });
      return ok(data);
    } catch (error) {
      return fail(mapError(error, 'Failed to save onboarding step'));
    }
  };
};

export const buildCompleteOnboardingUseCase = ({ onboardingRepository, syncStorefrontDiscoveryWithReliability }) => {
  return async ({ tenantId, storeNameBaseline = '' }) => {
    try {
      const data = await onboardingRepository.complete({ storeNameBaseline });
      let sync = null;

      if (tenantId) {
        sync = await syncStorefrontDiscoveryWithReliability({
          tenantId,
          source: 'tenant_onboarding_complete'
        }).catch((error) => ({
          ok: false,
          attempts: 0,
          errors: [error?.message || 'unknown_error']
        }));
      }

      return ok({
        ...data,
        storefront_sync: sync
      });
    } catch (error) {
      return fail(mapError(error, 'Failed to complete onboarding'));
    }
  };
};
