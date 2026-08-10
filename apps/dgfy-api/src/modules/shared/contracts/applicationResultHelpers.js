import { mapDomainErrorToHttp } from './domainErrorMapper.js';

export const unwrapApplicationResultOrThrow = (result, fallbackMessage = 'Request failed') => {
    if (result?.success) {
        return result.data;
    }

    const mappedDomainError = mapDomainErrorToHttp(result?.error);
    const statusCode = mappedDomainError?.statusCode || result?.error?.statusCode || 500;
    const message = mappedDomainError?.payload?.message
        || result?.error?.message
        || result?.message
        || fallbackMessage;
    const code = mappedDomainError?.payload?.code || result?.error?.code || null;
    const details = mappedDomainError?.payload?.details || result?.error?.details || null;

    const error = new Error(message);
    error.code = code;
    error.details = details;
    error.statusCode = statusCode;
    throw error;
};
