export const DomainErrorCode = Object.freeze({
    VALIDATION_FAILED: 'VALIDATION_FAILED',
    TENANT_CONTEXT_MISSING: 'TENANT_CONTEXT_MISSING',
    TENANT_NOT_FOUND: 'TENANT_NOT_FOUND',
    RESOURCE_NOT_FOUND: 'RESOURCE_NOT_FOUND',
    AUTHENTICATION_FAILED: 'AUTHENTICATION_FAILED',
    AUTHORIZATION_FAILED: 'AUTHORIZATION_FAILED',
    CONFLICT: 'CONFLICT',
    SERVICE_UNAVAILABLE: 'SERVICE_UNAVAILABLE',
    INTERNAL_ERROR: 'INTERNAL_ERROR'
});

const DOMAIN_ERROR_STATUS = Object.freeze({
    [DomainErrorCode.VALIDATION_FAILED]: 400,
    [DomainErrorCode.TENANT_CONTEXT_MISSING]: 400,
    [DomainErrorCode.TENANT_NOT_FOUND]: 404,
    [DomainErrorCode.RESOURCE_NOT_FOUND]: 404,
    [DomainErrorCode.AUTHENTICATION_FAILED]: 401,
    [DomainErrorCode.AUTHORIZATION_FAILED]: 403,
    [DomainErrorCode.CONFLICT]: 409,
    [DomainErrorCode.SERVICE_UNAVAILABLE]: 503,
    [DomainErrorCode.INTERNAL_ERROR]: 500
});

export const resolveDomainErrorStatus = (code) => DOMAIN_ERROR_STATUS[code] || 500;

export class DomainError extends Error {
    constructor(code, message, options = {}) {
        super(message);
        this.name = 'DomainError';
        this.code = code || DomainErrorCode.INTERNAL_ERROR;
        this.details = options.details || null;
        this.statusCode = Number.isInteger(options.statusCode)
            ? options.statusCode
            : resolveDomainErrorStatus(this.code);
    }
}

export const isDomainError = (value) => (
    value instanceof DomainError
    || (
        value
        && typeof value === 'object'
        && typeof value.code === 'string'
        && typeof value.message === 'string'
    )
);
