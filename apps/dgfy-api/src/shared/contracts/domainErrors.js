// Shared DomainError contract for apps/dgfy-api (per docs/architecture/adr/0032
// and .planning/phases/04-backend-accounts-businesses-and-tenancy-foundation/
// 04-PLAN.md "Pattern Reuse & Adaptation" — apps/dgfy-api/src/shared/contracts/
// is the canonical Clean Architecture location for cross-module error/result
// contracts, mirroring backend/src/modules/shared/contracts/domainErrors.js).
//
// NOTE: this is intentionally separate from
// apps/dgfy-api/src/modules/dgfyAuth/contracts/domainErrors.js — dgfyAuth is
// the legacy backend-proxying module (out of scope for Phase 4, see
// apps/dgfy-api/src/infra/backendProxy.js) and owns its own copy. New Phase 4
// modules (accounts, businesses, tenancy) import from here instead.

export const DomainErrorCode = Object.freeze({
    VALIDATION_FAILED: 'VALIDATION_FAILED',
    RESOURCE_NOT_FOUND: 'RESOURCE_NOT_FOUND',
    AUTHENTICATION_FAILED: 'AUTHENTICATION_FAILED',
    AUTHORIZATION_FAILED: 'AUTHORIZATION_FAILED',
    CONFLICT: 'CONFLICT',
    SERVICE_UNAVAILABLE: 'SERVICE_UNAVAILABLE',
    INTERNAL_ERROR: 'INTERNAL_ERROR'
});

const DOMAIN_ERROR_STATUS = Object.freeze({
    [DomainErrorCode.VALIDATION_FAILED]: 400,
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

    toJSON() {
        return {
            code: this.code,
            message: this.message,
            ...(this.details ? { details: this.details } : {})
        };
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

export default DomainError;
