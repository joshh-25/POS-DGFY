// Shared response formatter for apps/dgfy-api Clean Architecture controllers
// (Wave 2, .planning/phases/04-backend-accounts-businesses-and-tenancy-
// foundation/04-02-PLAN.md). Sibling to shared/contracts/{applicationResult,
// domainErrors}.js — mirrors backend/src/modules/shared/controllers/
// useCaseResponder.js's role (consistent response envelope) but is adapted
// to the class-based ApplicationResult used by apps/dgfy-api's new Phase 4
// modules (result.isSuccess, result.toJSON(), result.statusCode).
//
// Failure HTTP status codes are resolved from the ApplicationResult itself
// (via its .statusCode getter, which reads the originating DomainError's
// statusCode) — controllers never need to map domain error codes to HTTP
// status themselves. Only the success status code (200 vs 201, etc.) is
// supplied by the caller, since that is a transport concern the use case
// layer has no opinion on.

/**
 * @param {import('express').Response} res
 * @param {import('../contracts/applicationResult.js').ApplicationResult} result
 * @param {number} [successStatusCode=200]
 */
export const sendUseCaseResult = (res, result, successStatusCode = 200) => {
    if (!result || typeof result.toJSON !== 'function') {
        return res.status(500).json({
            success: false,
            data: null,
            error: { code: 'INTERNAL_ERROR', message: 'Unexpected use case result.' },
            message: 'Unexpected use case result.'
        });
    }

    const statusCode = result.isSuccess ? successStatusCode : result.statusCode;
    return res.status(statusCode).json(result.toJSON());
};

export default sendUseCaseResult;
