import { ApplicationResult } from '../../../shared/contracts/applicationResult.js';
import { DomainError, DomainErrorCode } from '../../../shared/contracts/domainErrors.js';

// retryFinalizationUseCases.js — Phase 10 Plan 08 Task 2 (STF-05,
// T-10-08-05). Operator-invokable re-run of finalizePaidOrder for a
// session stuck `paid` or `finalize_failed_manual_resolution_required` —
// mirrors the ~20-line legacy retry usecase (backend/src/modules/
// commercePayments/usecases/commercePaymentAdminUseCases.js's
// buildRetryCommercePaymentFinalizationUseCase, READ-ONLY reference),
// reusing the SAME finalizePaidOrder function the webhook path calls so
// retry behavior is never a second, divergent finalize implementation.

const validationError = (message) => new DomainError(
    DomainErrorCode.VALIDATION_FAILED,
    message,
    { statusCode: 400 }
);

const notFoundError = (message) => new DomainError(
    DomainErrorCode.RESOURCE_NOT_FOUND,
    message,
    { statusCode: 404 }
);

const conflictError = (message) => new DomainError(
    DomainErrorCode.CONFLICT,
    message,
    { statusCode: 409 }
);

const authorizationError = (message) => new DomainError(
    DomainErrorCode.AUTHORIZATION_FAILED,
    message,
    { statusCode: 403 }
);

// Only a session that PayMongo actually confirmed payment for is
// retryable — never a session that's merely `awaiting_payment`,
// `failed`, or `expired` (retrying those would be finalizing something
// that was never paid).
const RETRYABLE_STATUSES = ['paid', 'finalize_failed_manual_resolution_required'];

/**
 * @param {{findSessionByPublicReference: Function, finalizePaidOrder: Function, businessRepository?: Object}} deps
 *   `businessRepository` is OPTIONAL (mirrors this codebase's
 *   `businessDatabaseRegistryRepository` optionality convention) so this
 *   usecase can always be constructed; the staff-or-owner membership gate
 *   (T-10-08-05) simply doesn't run when it's omitted — the composition
 *   root (index.js) always supplies it in production.
 * @returns {Function} async (input: {sessionReference, actorAccountId}) => Promise<ApplicationResult>
 */
export function buildRetryFinalizationUseCase({ findSessionByPublicReference, finalizePaidOrder, businessRepository } = {}) {
    if (typeof findSessionByPublicReference !== 'function') {
        throw new Error('buildRetryFinalizationUseCase requires a findSessionByPublicReference function.');
    }
    if (typeof finalizePaidOrder !== 'function') {
        throw new Error('buildRetryFinalizationUseCase requires a finalizePaidOrder function.');
    }

    return async ({ sessionReference, actorAccountId = null } = {}) => {
        if (!sessionReference) {
            return ApplicationResult.failure(validationError('sessionReference is required.'));
        }

        const session = await findSessionByPublicReference(sessionReference);
        if (!session) {
            return ApplicationResult.failure(notFoundError('Payment session not found.'));
        }

        if (businessRepository) {
            const membership = await businessRepository.getMembership(actorAccountId, session.tenant_id);
            if (!membership || membership.status !== 'active') {
                return ApplicationResult.failure(authorizationError(
                    'You must be a staff member or owner of this business to retry finalization.'
                ));
            }
        }

        if (!RETRYABLE_STATUSES.includes(session.status)) {
            return ApplicationResult.failure(conflictError(
                'Only paid or manual-resolution-required sessions can be retried.'
            ));
        }

        return finalizePaidOrder({ session, resource: {}, providerEventId: session.provider_event_id });
    };
}

export default buildRetryFinalizationUseCase;
