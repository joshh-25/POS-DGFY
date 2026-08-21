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
    STOREFRONT_IMAGE_PROCESSING_FAILED: 'STOREFRONT_IMAGE_PROCESSING_FAILED',
    STOREFRONT_IMAGE_PERSIST_FAILED: 'STOREFRONT_IMAGE_PERSIST_FAILED',
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

// Precondition failures that are modeled as SERVICE_UNAVAILABLE (503) for the HTTP contract --
// "this optional integration isn't configured/enabled" -- but that are expected client/environment
// state, not a fault. Reported via `details.reason_code` at the throw site (the domain-layer code
// that actually knows whether a given 503 is a real outage or a known missing-config state) rather
// than inferred from message text. Kept narrow and explicit on purpose: only SERVICE_UNAVAILABLE
// errors with a reason_code on this list are treated as non-reportable, so an unrecognized future
// 503 (or a genuine INTERNAL_ERROR/STORE_CATALOG_RUNTIME_ERROR) still reports normally. See #508.
const EXPECTED_UNAVAILABLE_REASON_CODES = new Set([
    'NO_PRINTER_CONFIGURED',           // clientManagedDeviceDriver.js -- no printer/cash drawer configured
    'POS_HARDWARE_DISABLED',           // disabledDeviceDriver.js -- hardware administratively disabled
    'POS_PRINTING_DISABLED',           // disabledDeviceDriver.js -- printing administratively disabled
    'ROUTE_CALCULATOR_NOT_CONFIGURED'  // routeCalculatorUseCases.js -- ROUTE_CALCULATOR_ENDPOINT unset
]);

export const isExpectedDomainFailure = (error) => {
    if (!error || error.code !== DomainErrorCode.SERVICE_UNAVAILABLE) return false;
    const reasonCode = error.details?.reason_code;
    return Boolean(reasonCode) && EXPECTED_UNAVAILABLE_REASON_CODES.has(reasonCode);
};
