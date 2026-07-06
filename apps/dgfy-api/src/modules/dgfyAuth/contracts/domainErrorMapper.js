import { DomainErrorCode, resolveDomainErrorStatus, isDomainError } from './domainErrors.js';

export const mapDomainErrorToHttp = (error) => {
    if (!isDomainError(error)) {
        return null;
    }

    const code = error.code || DomainErrorCode.INTERNAL_ERROR;
    const statusCode = Number.isInteger(error.statusCode)
        ? error.statusCode
        : resolveDomainErrorStatus(code);

    return {
        statusCode,
        payload: {
            code,
            message: error.message || 'Internal Server Error',
            details: error.details || null
        }
    };
};
