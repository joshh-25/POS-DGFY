export const DomainErrorCode = Object.freeze({
    VALIDATION_FAILED: 'VALIDATION_FAILED',
    TENANT_CONTEXT_MISSING: 'TENANT_CONTEXT_MISSING',
    TENANT_NOT_FOUND: 'TENANT_NOT_FOUND',
    RESOURCE_NOT_FOUND: 'RESOURCE_NOT_FOUND',
    AUTHENTICATION_FAILED: 'AUTHENTICATION_FAILED',
    AUTHORIZATION_FAILED: 'AUTHORIZATION_FAILED',
    CONFLICT: 'CONFLICT',
    CUSTOMER_ACCESS_MODE_BLOCKED: 'CUSTOMER_ACCESS_MODE_BLOCKED',
    STORE_CATALOG_LOCATION_INVALID: 'STORE_CATALOG_LOCATION_INVALID',
    STORE_CATALOG_RUNTIME_ERROR: 'STORE_CATALOG_RUNTIME_ERROR',
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
    [DomainErrorCode.CUSTOMER_ACCESS_MODE_BLOCKED]: 403,
    [DomainErrorCode.STORE_CATALOG_LOCATION_INVALID]: 422,
    [DomainErrorCode.STORE_CATALOG_RUNTIME_ERROR]: 500,
    [DomainErrorCode.SERVICE_UNAVAILABLE]: 503,
    [DomainErrorCode.INTERNAL_ERROR]: 500
});

export const resolveDomainErrorStatus = (code) => DOMAIN_ERROR_STATUS[code] || 500;

export class DomainError extends Error {
    constructor(code, message, options = {}) {
        // `cause` lets a use case's catch block remap an infrastructure
        // error (a SequelizeConnectionError, say) into a stable domain code
        // for the HTTP layer without discarding the original error's stack
        // and details -- callers that need the real failure for logging or
        // error reporting can read it back off `error.cause`.
        super(message, options.cause !== undefined ? { cause: options.cause } : undefined);
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
