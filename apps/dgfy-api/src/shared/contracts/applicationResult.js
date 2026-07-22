// Shared ApplicationResult envelope for apps/dgfy-api (per docs/architecture/
// adr/0032 and .planning/phases/04-backend-accounts-businesses-and-tenancy-
// foundation/04-02-PLAN.md, which already imports controllers/response
// formatting from this exact location: apps/dgfy-api/src/shared/contracts/
// applicationResult.js and apps/dgfy-api/src/shared/controllers/
// useCaseResponder.js). Mirrors backend/src/modules/shared/contracts/
// applicationResult.js's success/failure envelope pattern, but exposes a
// class (ApplicationResult.success()/failure(), .isSuccess, .toJSON()) since
// Wave 2's controllers read result.isSuccess and call result.toJSON().
//
// NOTE: separate from apps/dgfy-api/src/modules/dgfyAuth/contracts/
// applicationResult.js — dgfyAuth is the legacy backend-proxying module (out
// of scope for Phase 4). New Phase 4 modules (accounts, businesses, tenancy)
// import from here instead.

/**
 * @template T
 */
export class ApplicationResult {
    constructor({ success, data = null, error = null, message = null } = {}) {
        this.success = Boolean(success);
        this.data = data;
        this.error = error || null;
        this.message = message || null;
    }

    get isSuccess() {
        return this.success;
    }

    get isFailure() {
        return !this.success;
    }

    /**
     * HTTP status code implied by this result: 200 on success, or the
     * originating DomainError's statusCode (default 500) on failure.
     */
    get statusCode() {
        if (this.success) return 200;
        return Number.isInteger(this.error?.statusCode) ? this.error.statusCode : 500;
    }

    /**
     * @template T
     * @param {T} data
     * @param {string|null} [message]
     * @returns {ApplicationResult<T>}
     */
    static success(data = null, message = null) {
        return new ApplicationResult({ success: true, data, message });
    }

    /**
     * @param {Object} error - typically a DomainError, but any {code,message} shape works
     * @param {string|null} [message]
     * @returns {ApplicationResult<null>}
     */
    static failure(error, message = null) {
        return new ApplicationResult({
            success: false,
            error,
            message: message || error?.message || null
        });
    }

    toJSON() {
        return {
            success: this.success,
            data: this.data,
            error: this.error
                ? {
                    code: this.error.code || 'INTERNAL_ERROR',
                    message: this.error.message || 'An unexpected error occurred.',
                    ...(this.error.details ? { details: this.error.details } : {})
                }
                : null,
            message: this.message
        };
    }
}

/**
 * @template T
 * @param {T} data
 * @param {string|null} [message]
 * @returns {ApplicationResult<T>}
 */
export const ok = (data, message = null) => ApplicationResult.success(data, message);

/**
 * @param {Object} error
 * @param {string|null} [message]
 * @returns {ApplicationResult<null>}
 */
export const fail = (error, message = null) => ApplicationResult.failure(error, message);

export default ApplicationResult;
