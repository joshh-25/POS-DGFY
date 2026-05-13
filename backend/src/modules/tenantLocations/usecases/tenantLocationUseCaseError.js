import { DomainError, DomainErrorCode } from '../../shared/contracts/domainErrors.js';

export const mapTenantLocationUseCaseError = (error, fallbackMessage = 'Tenant location request failed') => {
    if (error instanceof DomainError) {
        return error;
    }

    const rawCode = error?.name || error?.original?.code || error?.code || '';
    const code = String(rawCode).toUpperCase();
    if (code === 'SEQUELIZEUNIQUECONSTRAINTERROR' || code === 'ER_DUP_ENTRY') {
        return new DomainError(
            DomainErrorCode.CONFLICT,
            error?.message || 'A tenant location with that identifier already exists.',
            { statusCode: 409 }
        );
    }

    if (
        code === 'SEQUELIZEFOREIGNKEYCONSTRAINTERROR'
        || code === 'ER_ROW_IS_REFERENCED'
        || code === 'ER_ROW_IS_REFERENCED_2'
    ) {
        return new DomainError(
            DomainErrorCode.CONFLICT,
            'Location has operational history and cannot be permanently deleted. Deactivate it instead.',
            {
                statusCode: 409,
                details: {
                    original_message: error?.message || null
                }
            }
        );
    }

    if (
        code === 'TENANTLOCATIONREFERENCEGUARDUNAVAILABLEERROR'
        || code === 'TENANT_LOCATION_REFERENCE_GUARD_UNAVAILABLE'
    ) {
        return new DomainError(
            DomainErrorCode.SERVICE_UNAVAILABLE,
            'Location reference guard is unavailable. Permanent delete is disabled until tenant schema/runtime is healthy.',
            {
                statusCode: 503,
                details: {
                    source_key: error?.sourceKey || null,
                    model_name: error?.modelName || null,
                    reason: error?.reason || null,
                    original_message: error?.message || null
                }
            }
        );
    }

    return new DomainError(
        DomainErrorCode.INTERNAL_ERROR,
        fallbackMessage,
        {
            statusCode: 500,
            details: {
                original_message: error?.message || null
            }
        }
    );
};
