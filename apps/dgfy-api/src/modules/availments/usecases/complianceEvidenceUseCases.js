import { ApplicationResult } from '../../../shared/contracts/applicationResult.js';
import { DomainError, DomainErrorCode } from '../../../shared/contracts/domainErrors.js';

// complianceEvidenceUseCases.js — Clean Architecture Application layer for
// the D-23 interim per-business compliance-evidence attestation store.
// Mirrors ../../inventory/usecases/inventoryMovementUseCases.js's
// ApplicationResult/DomainError/guardBusinessAccess conventions. This is
// NOT the full 7-signal fiscal-evidence subsystem (fiscal accumulator,
// append-only audit, encryption, submission docs, RMO filing, fiscal
// terminal registration, payment-handoff) RESEARCH's "Fiscal Checkout
// Evidence Path" section describes as future scope — it is the deliberately
// minimal MVP shape (RESEARCH option B / A8): an operator attests the
// { settings, artifacts, peripherals, evidence } bundle once per
// (business, branch), and buildFinalizeAvailmentUseCase (../usecases/
// availmentUseCases.js) reads it via assembleEvidenceBundle() and forwards
// it verbatim to assertComplianceGate for a compliant_active checkout.
// `compliance_profile` (the fifth section the gate's checklist evaluates) is
// intentionally NOT part of this bundle — the gate loads it directly from
// the persisted compliance_mode_state row (complianceGate.js:124-126), so
// there is no attestation-store input for it here.

const validationError = (message, details = null) => new DomainError(
    DomainErrorCode.VALIDATION_FAILED,
    message,
    { statusCode: 400, details }
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

const noTenantDatabaseError = () => new DomainError(
    DomainErrorCode.RESOURCE_NOT_FOUND,
    'No tenant database is registered for this business.',
    { statusCode: 404, details: { error_code: 'NO_TENANT_DATABASE' } }
);

const conflictError = (message, details = null) => new DomainError(
    DomainErrorCode.CONFLICT,
    message,
    { statusCode: 409, details }
);

/**
 * Duck-types on `error.name === 'TenantDatabaseUnavailableError'` rather
 * than importing complianceEvidenceRepository.js's class directly — mirrors
 * inventoryMovementUseCases.js's self-contained convention.
 * @param {Error} error
 */
const isTenantDatabaseUnavailableError = (error) => Boolean(error) && error.name === 'TenantDatabaseUnavailableError';

/** @param {Error} error */
const isDuplicateComplianceEvidenceError = (error) => Boolean(error) && error.name === 'DuplicateComplianceEvidenceError';

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
 * Shared access-control helper (mirrors inventoryMovementUseCases.js's
 * private requireMembership()).
 * @returns {Promise<{membership?: Object, error?: DomainError}>}
 */
async function requireMembership(businessRepository, businessId, accountId) {
    const membership = await businessRepository.getMembership(accountId, businessId);
    if (!membership || membership.status !== 'active') {
        return { error: forbiddenError('You must be an active member of this business.') };
    }
    return { membership };
}

/**
 * Verifies the business exists and, when requestingAccountId is supplied,
 * that the requester is an active member of it.
 * @returns {Promise<{membership?: Object, error?: DomainError}>}
 */
async function guardBusinessAccess(businessRepository, businessId, requestingAccountId) {
    const business = await businessRepository.findById(businessId);
    if (!business) {
        return { error: businessNotFoundError() };
    }
    if (requestingAccountId) {
        return requireMembership(businessRepository, businessId, requestingAccountId);
    }
    return {};
}

/**
 * Checks if the member is authorized to attest compliance evidence
 * (owner-only for now — mirrors availmentUseCases.js's
 * hasManualDiscountPermission(); extensible when role-based permissions are
 * added). Attesting a fiscal-evidence bundle is a sensitive, business-owner-
 * level operation, not a general staff action.
 * @returns {boolean}
 */
function hasComplianceAttestationPermission(membership) {
    return Boolean(membership) && (membership.role === 'owner' || membership.permission === 'compliance_attestation');
}

/**
 * Owner/authorized-member-gated operator endpoint: persists the
 * operator-attested { settings, artifacts, peripherals, evidence } bundle
 * for a (business, branch) pair (D-23). `compliance_profile` is NOT part of
 * this bundle (see file header) — only these four sections are stored here.
 * @param {{repository, businessRepository}} deps
 */
export function buildAttestComplianceEvidenceUseCase({ repository, businessRepository }) {
    return async (input = {}) => {
        const {
            businessId,
            requestingAccountId,
            branchId = null,
            settings = {},
            artifacts = [],
            peripherals = [],
            evidence = {}
        } = input;

        if (!businessId) {
            return ApplicationResult.failure(validationError('businessId is required.'));
        }

        const { membership, error } = await guardBusinessAccess(businessRepository, businessId, requestingAccountId);
        if (error) return ApplicationResult.failure(error);

        if (!hasComplianceAttestationPermission(membership)) {
            return ApplicationResult.failure(forbiddenError('You do not have permission to attest compliance evidence.'));
        }

        try {
            const result = await repository.upsert(businessId, branchId, {
                evidenceBundle: { settings, artifacts, peripherals, evidence },
                attestedByActorType: 'operator',
                attestedAt: new Date()
            });
            return ApplicationResult.success(result);
        } catch (repoError) {
            if (isTenantDatabaseUnavailableError(repoError)) {
                return ApplicationResult.failure(mapTenantDatabaseError(repoError));
            }
            if (isDuplicateComplianceEvidenceError(repoError)) {
                return ApplicationResult.failure(conflictError(repoError.message));
            }
            throw repoError;
        }
    };
}

/**
 * Pure function: maps a stored compliance_evidence row (or null, when no
 * attestation exists yet) into the { artifacts, peripherals, settings,
 * evidence } shape assertComplianceGate expects (RESEARCH "Fiscal Checkout
 * Evidence Path" §1). Defaults to empty arrays/objects when evidenceRow is
 * null or its evidence_bundle is malformed — the correct behavior for a
 * non_compliant_active business (which never reaches the gate's checklist
 * branch) and a safe fail-closed default for a compliant_active business
 * with no attestation yet (the gate's checklist then correctly reports
 * REQUIRES_SETUP rather than silently ALLOW-ing on missing data).
 * @param {Object|null} evidenceRow - the plain row from
 *   ComplianceEvidenceRepository.getForBusinessBranch()
 * @returns {{artifacts: Array, peripherals: Array, settings: Object, evidence: Object}}
 */
export function assembleEvidenceBundle(evidenceRow) {
    const bundle = evidenceRow && evidenceRow.evidence_bundle && typeof evidenceRow.evidence_bundle === 'object'
        ? evidenceRow.evidence_bundle
        : {};

    return {
        artifacts: Array.isArray(bundle.artifacts) ? bundle.artifacts : [],
        peripherals: Array.isArray(bundle.peripherals) ? bundle.peripherals : [],
        settings: (bundle.settings && typeof bundle.settings === 'object') ? bundle.settings : {},
        evidence: (bundle.evidence && typeof bundle.evidence === 'object') ? bundle.evidence : {}
    };
}
