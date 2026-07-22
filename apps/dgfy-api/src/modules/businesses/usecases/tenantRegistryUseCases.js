import { ApplicationResult } from '../../../shared/contracts/applicationResult.js';
import { DomainError, DomainErrorCode } from '../../../shared/contracts/domainErrors.js';

// tenantRegistryUseCases.js — Clean Architecture Application layer for Wave 6
// gap-closure safe tenant registry lookup (API-03), mirroring
// ../businessUseCases.js's/../tenantSessionUseCases.js's style: the builder
// receives its dependencies via closure and the use case always returns an
// ApplicationResult.
//
// D-14 boundary: this use case is READ-ONLY registry metadata lookup. It
// never calls accountStaffAssignmentRepository, TenantConnector.getConnection,
// buildActivateBusinessSessionUseCase, token helpers, or any session-creation
// helper — activation/switching stays the separate concern
// tenantSessionUseCases.js already owns (POST /businesses/:id/activate-session).

const validationError = (message) => new DomainError(
    DomainErrorCode.VALIDATION_FAILED,
    message,
    { statusCode: 400 }
);

const notFoundError = (message = 'Business not found.') => new DomainError(
    DomainErrorCode.RESOURCE_NOT_FOUND,
    message,
    { statusCode: 404 }
);

const noMembershipError = () => new DomainError(
    DomainErrorCode.AUTHORIZATION_FAILED,
    'You are not a member of this business.',
    { statusCode: 403, details: { error_code: 'NO_MEMBERSHIP' } }
);

const noRegistryError = () => new DomainError(
    DomainErrorCode.RESOURCE_NOT_FOUND,
    'No tenant registry metadata exists for this business.',
    { statusCode: 404, details: { error_code: 'NO_TENANT_REGISTRY' } }
);

const serviceUnavailableError = (message) => new DomainError(
    DomainErrorCode.SERVICE_UNAVAILABLE,
    message,
    { statusCode: 503 }
);

/**
 * Safe tenant registry metadata lookup (API-03, T-04-06-01/02/04):
 * validates business existence (404), validates active landlord membership
 * for requestingAccountId (403), then returns
 * businessDatabaseRegistryRepository.toSafeMetadata() output. No session
 * activation side effect.
 * @param {{businessRepository, businessDatabaseRegistryRepository}} deps
 */
export function buildGetTenantRegistryUseCase({ businessRepository, businessDatabaseRegistryRepository }) {
    return async (input = {}) => {
        const { businessId, requestingAccountId } = input;

        if (!businessId || !requestingAccountId) {
            return ApplicationResult.failure(validationError(
                'businessId and an authenticated account are required.'
            ));
        }

        const business = await businessRepository.findById(businessId);
        if (!business) {
            return ApplicationResult.failure(notFoundError());
        }

        const membership = await businessRepository.getMembership(requestingAccountId, businessId);
        if (!membership || membership.status !== 'active') {
            return ApplicationResult.failure(noMembershipError());
        }

        if (!businessDatabaseRegistryRepository) {
            return ApplicationResult.failure(
                serviceUnavailableError('Tenant database registry is not configured.')
            );
        }

        const registryEntry = await businessDatabaseRegistryRepository.findByBusinessId(businessId);
        if (!registryEntry) {
            return ApplicationResult.failure(noRegistryError());
        }

        return ApplicationResult.success({
            tenant_registry: businessDatabaseRegistryRepository.toSafeMetadata(registryEntry)
        });
    };
}

export default { buildGetTenantRegistryUseCase };
