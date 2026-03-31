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
