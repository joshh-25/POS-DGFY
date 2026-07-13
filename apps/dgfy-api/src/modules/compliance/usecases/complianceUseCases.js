import { ApplicationResult } from '../../../shared/contracts/applicationResult.js';
import { DomainError, DomainErrorCode } from '../../../shared/contracts/domainErrors.js';
import { createComplianceEntity } from '../entities/complianceEntity.js';
import { COMPLIANCE_VERIFIER_ACTOR_TYPE, COMPLIANCE_MODE_STATE, COMPLIANCE_VERIFICATION_STATUS } from '../policy/constants.js';

// complianceUseCases.js — Clean Architecture Application layer for the
// tenant-scoped compliance-mode state machine (D-01/D-04), mirroring
// ../../shifts/usecases/shiftUseCases.js. Each builder receives its
// dependencies via closure (repository = ComplianceModeStateRepository,
// businessRepository = the businesses module's BusinessRepository, used
// ONLY for membership/role access control since membership lives in the
// landlord dgfy_core database) and every use case always returns an
// ApplicationResult. No HTTP concerns, no direct model imports.
//
// D-04 manual review path, and why "owner" gates reviewComplianceState:
// legacy's COMPLIANCE_VERIFIER_ACTOR_TYPE distinguishes tenant_master_admin
// from platform_admin, but neither role exists yet in this system's Accounts/
// Businesses APIs (landlord business_memberships only has 'owner'/'member',
// per businessUseCases.js) — there is no platform-operator role surface to
// gate against. reviewComplianceState therefore requires the caller to be an
// active business owner (the closest available authority in the current
// role model) AND to explicitly supply a valid verifierActorType value,
// which is recorded on the row (verified_by_actor_type) exactly as legacy's
// enum intends. This keeps the manual review path usable today without
// inventing a platform_admin auth system this phase doesn't build, and
// without blocking a future phase from tightening the access-control check
// alone (verifierActorType's shape does not need to change).

const validationError = (message, details = null) => new DomainError(
    DomainErrorCode.VALIDATION_FAILED,
    message,
    { statusCode: 400, details }
);

const notFoundError = (message = 'Compliance-mode state not found for this business/branch.') => new DomainError(
    DomainErrorCode.RESOURCE_NOT_FOUND,
    message,
    { statusCode: 404 }
);

const businessNotFoundError = () => new DomainError(
    DomainErrorCode.RESOURCE_NOT_FOUND,
    'Business not found.',
    { statusCode: 404 }
);

const forbiddenError = (message) => new DomainError(
    DomainErrorCode.AUTHORIZATION_FAILED,
    message,
    { statusCode: 403 }
);

/**
 * CR-01/FSC-01 (T-08-09-03): maps a race-loser DuplicateComplianceModeStateError
 * (thrown by complianceModeStateRepository.js's upsertState() when the DB
 * unique index rejects a concurrent duplicate row) to a clean 409 CONFLICT,
 * mirroring complianceGate.js's requiresSetupError CONFLICT/409 shape —
 * instead of letting it fall through to a misleading
 * TenantDatabaseUnavailableError('unreachable') 503.
 */
const duplicateComplianceStateError = () => new DomainError(
    DomainErrorCode.CONFLICT,
    'A compliance-mode-state row already exists for this business/branch. Retry the request.',
    { statusCode: 409, details: { error_code: 'DUPLICATE_COMPLIANCE_MODE_STATE' } }
);

const noTenantDatabaseError = () => new DomainError(
    DomainErrorCode.RESOURCE_NOT_FOUND,
    'No tenant database is registered for this business.',
    { statusCode: 404, details: { error_code: 'NO_TENANT_DATABASE' } }
);

/**
 * Duck-types on `error.name === 'TenantDatabaseUnavailableError'` rather
 * than importing complianceModeStateRepository.js's class directly — mirrors
 * shiftUseCases.js's self-contained convention.
 * @param {Error} error
 */
const isTenantDatabaseUnavailableError = (error) => Boolean(error) && error.name === 'TenantDatabaseUnavailableError';

/** @param {Error} error */
const isComplianceStateNotFoundError = (error) => Boolean(error) && error.name === 'ComplianceStateNotFoundError';

/**
 * Duck-types on `error.name === 'DuplicateComplianceModeStateError'` rather
 * than importing complianceModeStateRepository.js's class directly — mirrors
 * this file's isTenantDatabaseUnavailableError()/isComplianceStateNotFoundError()
 * self-contained convention (CR-01/FSC-01).
 * @param {Error} error
 */
const isDuplicateComplianceModeStateError = (error) => Boolean(error) && error.name === 'DuplicateComplianceModeStateError';

/**
 * Maps a thrown TenantDatabaseUnavailableError to a stable
 * ApplicationResult-ready DomainError. `missing`/`not_configured` surface as
 * 404; every other reason surfaces as 503 SERVICE_UNAVAILABLE.
 * @param {Error} error
 */
const mapTenantDatabaseError = (error) => {
    if (error.reason === 'missing' || error.reason === 'not_configured') {
        return noTenantDatabaseError();
    }
    return new DomainError(
        DomainErrorCode.SERVICE_UNAVAILABLE,
        error.message,
        { statusCode: 503, details: { error_code: 'TENANT_DATABASE_UNAVAILABLE', reason: error.reason } }
    );
};

/**
 * Shared access-control helper (mirrors shiftUseCases.js's private
 * requireMembership() — duplicated here rather than imported so this module
 * stays self-contained).
 * @returns {Promise<{membership?: Object, error?: DomainError}>}
 */
async function requireMembership(businessRepository, businessId, accountId, { role } = {}) {
    const membership = await businessRepository.getMembership(accountId, businessId);
    if (!membership || membership.status !== 'active') {
        return { error: forbiddenError('You are not a member of this business.') };
    }
    if (role && membership.role !== role) {
        return { error: forbiddenError(`Only a business ${role} can perform this action.`) };
    }
    return { membership };
}

/**
 * Verifies the business exists and, when requestingAccountId is supplied,
 * that the requester satisfies the given membership/role requirement.
 * @returns {Promise<{error?: DomainError}>}
 */
async function guardBusinessAccess(businessRepository, businessId, requestingAccountId, { role } = {}) {
    const business = await businessRepository.findById(businessId);
    if (!business) {
        return { error: businessNotFoundError() };
    }
    if (requestingAccountId) {
        const { error } = await requireMembership(businessRepository, businessId, requestingAccountId, { role });
        if (error) return { error };
    }
    return {};
}

const normalizeBranchId = (branchId) => (branchId === undefined || branchId === null || branchId === '' ? null : Number(branchId));

const isPlainObject = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);

/**
 * Reads the current compliance-mode state for a business/branch (FSC-01).
 * Any active member may read it. Returns a default (never-yet-submitted)
 * shape rather than a 404 when no row exists — a business that has never
 * submitted evidence is legitimately `non_compliant_active` by default
 * (D-02), not an error state.
 * @param {{repository, businessRepository}} deps
 */
export function buildGetComplianceStateUseCase({ repository, businessRepository }) {
    return async (input = {}) => {
        const { businessId, requestingAccountId } = input;
        const branchId = normalizeBranchId(input.branchId);

        if (!businessId) {
            return ApplicationResult.failure(validationError('businessId is required.'));
        }

        const { error } = await guardBusinessAccess(businessRepository, businessId, requestingAccountId);
        if (error) return ApplicationResult.failure(error);

        try {
            const row = await repository.getForBusinessBranch(businessId, branchId);
            const compliance = createComplianceEntity(row || { business_id: businessId, branch_id: branchId });
            return ApplicationResult.success({ compliance: compliance.toPlain() });
        } catch (tenantError) {
            if (isTenantDatabaseUnavailableError(tenantError)) {
                return ApplicationResult.failure(mapTenantDatabaseError(tenantError));
            }
            throw tenantError;
        }
    };
}

/**
 * Submits/updates compliance evidence (D-04). Staff-or-owner required (any
 * active business membership) — there is no distinct 'staff' role value at
 * the landlord business_memberships level, matching
 * inventoryMovementUseCases.js's precedent. `complianceProfile` is accepted
 * as a full replacement object (client sends the whole BIR/NPC/BSP profile
 * shape it has gathered, matching COMPLIANCE_PROFILE_DEFAULT's nested
 * structure — see ../policy/constants.js); this usecase does not attempt a
 * partial/deep-merge of profile fields, keeping the write path simple and
 * predictable.
 *
 * Submitting new evidence always resets verification_status to
 * pending_review (and clears verified_by_actor_type/verified_at) — new
 * evidence must be re-reviewed before any state transition, even if the
 * prior submission was already verified/rejected.
 * @param {{repository, businessRepository}} deps
 */
export function buildSubmitComplianceEvidenceUseCase({ repository, businessRepository }) {
    return async (input = {}) => {
        const { businessId, requestingAccountId, complianceProfile, activePolicyPackVersion } = input;
        const branchId = normalizeBranchId(input.branchId);

        if (!businessId) {
            return ApplicationResult.failure(validationError('businessId is required.'));
        }
        if (!isPlainObject(complianceProfile)) {
            return ApplicationResult.failure(validationError('complianceProfile is required and must be an object.'));
        }

        const { error } = await guardBusinessAccess(businessRepository, businessId, requestingAccountId);
        if (error) return ApplicationResult.failure(error);

        try {
            const existing = await repository.getForBusinessBranch(businessId, branchId);
            const updates = {
                compliance_profile: complianceProfile,
                ...(activePolicyPackVersion ? { active_policy_pack_version: activePolicyPackVersion } : {}),
                // Preserve the existing state (D-02's 3-state model is
                // transitioned only by reviewComplianceState, never by
                // evidence submission alone); default to non_compliant_active
                // on first-ever submission for this business/branch.
                state: existing?.state || COMPLIANCE_MODE_STATE.NON_COMPLIANT_ACTIVE
            };
            // upsertState() above guarantees the row now exists (creating it
            // on first submission), so recordVerification() below always
            // finds a row to patch — it cannot throw
            // ComplianceStateNotFoundError in this call sequence.
            await repository.upsertState(businessId, branchId, updates);
            const withResetVerification = await repository.recordVerification(businessId, branchId, {
                verification_status: COMPLIANCE_VERIFICATION_STATUS.PENDING_REVIEW,
                verified_by_actor_type: null,
                verified_at: null
            });

            const compliance = createComplianceEntity(withResetVerification);
            return ApplicationResult.success({ compliance: compliance.toPlain() });
        } catch (tenantError) {
            if (isDuplicateComplianceModeStateError(tenantError)) {
                return ApplicationResult.failure(duplicateComplianceStateError());
            }
            if (isTenantDatabaseUnavailableError(tenantError)) {
                return ApplicationResult.failure(mapTenantDatabaseError(tenantError));
            }
            throw tenantError;
        }
    };
}

const VALID_REVIEW_OUTCOMES = new Set([
    COMPLIANCE_VERIFICATION_STATUS.VERIFIED,
    COMPLIANCE_VERIFICATION_STATUS.REJECTED,
    COMPLIANCE_VERIFICATION_STATUS.REVOKED
]);

const VALID_MODE_STATES = new Set(Object.values(COMPLIANCE_MODE_STATE));
const VALID_VERIFIER_ACTOR_TYPES = new Set(Object.values(COMPLIANCE_VERIFIER_ACTOR_TYPE));

/**
 * Reviews submitted evidence and (optionally) transitions compliance-mode
 * state (D-04's manual review/transition path — automation is explicitly
 * NOT built this phase). Requires an active business owner (see this file's
 * header comment for why "owner" gates this today) AND a valid
 * verifierActorType input, recorded verbatim on the row.
 *
 * `verificationStatus` must be one of 'verified'/'rejected'/'revoked' —
 * 'pending_review' is evidence-submission's own default, never a reviewer
 * output. When verificationStatus === 'verified', `newState` is REQUIRED
 * and must be a valid COMPLIANCE_MODE_STATE value: the reviewer manually
 * decides the resulting state (no automatic completeness-based computation,
 * per D-04). For 'rejected'/'revoked' (FSC-01), `newState` is NOT consulted
 * — the state is unconditionally demoted to
 * COMPLIANCE_MODE_STATE.NON_COMPLIANT_ACTIVE, the fail-closed default (per
 * D-02/D-05 and this gap-closure's locked decision), so
 * evaluateComplianceDecision() (which branches only on the state column, not
 * verification_status) correctly blocks Fiscal POS_CHECKOUT once required
 * fiscal paperwork is revoked/rejected instead of leaving a stale
 * compliant_active row that still ALLOWs it.
 * @param {{repository, businessRepository}} deps
 */
export function buildReviewComplianceStateUseCase({ repository, businessRepository }) {
    return async (input = {}) => {
        const { businessId, requestingAccountId, verifierActorType, verificationStatus, newState } = input;
        const branchId = normalizeBranchId(input.branchId);

        if (!businessId) {
            return ApplicationResult.failure(validationError('businessId is required.'));
        }
        if (!verifierActorType || !VALID_VERIFIER_ACTOR_TYPES.has(verifierActorType)) {
            return ApplicationResult.failure(validationError(
                `verifierActorType must be one of: ${[...VALID_VERIFIER_ACTOR_TYPES].join(', ')}.`
            ));
        }
        if (!verificationStatus || !VALID_REVIEW_OUTCOMES.has(verificationStatus)) {
            return ApplicationResult.failure(validationError(
                `verificationStatus must be one of: ${[...VALID_REVIEW_OUTCOMES].join(', ')}.`
            ));
        }
        if (verificationStatus === COMPLIANCE_VERIFICATION_STATUS.VERIFIED && !VALID_MODE_STATES.has(newState)) {
            return ApplicationResult.failure(validationError(
                `newState is required and must be one of: ${[...VALID_MODE_STATES].join(', ')} when verificationStatus is 'verified'.`
            ));
        }

        const { error } = await guardBusinessAccess(businessRepository, businessId, requestingAccountId, { role: 'owner' });
        if (error) return ApplicationResult.failure(error);

        try {
            await repository.recordVerification(businessId, branchId, {
                verification_status: verificationStatus,
                verified_by_actor_type: verifierActorType,
                verified_at: new Date()
            });

            // FSC-01: reject/revoke must demote state to non_compliant_active
            // unconditionally (not merely leave verified/recorded metadata in
            // place) — a stale compliant_active row after a revocation is a
            // fail-open authorization bypass for Fiscal POS_CHECKOUT.
            const finalRow = verificationStatus === COMPLIANCE_VERIFICATION_STATUS.VERIFIED
                ? await repository.upsertState(businessId, branchId, { state: newState })
                : await repository.upsertState(businessId, branchId, { state: COMPLIANCE_MODE_STATE.NON_COMPLIANT_ACTIVE });

            const compliance = createComplianceEntity(finalRow);
            return ApplicationResult.success({ compliance: compliance.toPlain() });
        } catch (repoError) {
            if (isDuplicateComplianceModeStateError(repoError)) {
                return ApplicationResult.failure(duplicateComplianceStateError());
            }
            if (isTenantDatabaseUnavailableError(repoError)) {
                return ApplicationResult.failure(mapTenantDatabaseError(repoError));
            }
            if (isComplianceStateNotFoundError(repoError)) {
                return ApplicationResult.failure(notFoundError(
                    'No compliance evidence has been submitted for this business/branch yet — submit evidence before review.'
                ));
            }
            throw repoError;
        }
    };
}
