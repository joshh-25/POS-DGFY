import { ApplicationResult } from '../../../shared/contracts/applicationResult.js';
import { DomainError, DomainErrorCode } from '../../../shared/contracts/domainErrors.js';

// tenantSessionUseCases.js — Clean Architecture Application layer for Wave 4
// tenant session creation/activation (API-03/API-04, D-14). Mirrors
// ../businessUseCases.js's style: each builder receives its dependencies via
// closure and every use case always returns an ApplicationResult.
//
// DEVIATION FROM THE PLAN'S LITERAL 2-PARAM SIGNATURE
// (`buildCreateTenantSessionUseCase({businessRepository,
// businessDatabaseRegistry})`): the plan's own Step 3 requires querying
// tenant-local AccountStaffAssignment data, which is a separate repository
// responsibility under this codebase's established one-repository-per-
// domain Clean Architecture pattern (businessRepository owns landlord
// membership; businessDatabaseRegistry owns the landlord DB pointer;
// AccountStaffAssignment is tenant-local data with a completely different
// storage backend). Splitting this into a third `accountStaffAssignmentRepository`
// dependency preserves Single Responsibility while implementing the exact
// 4-step algorithm and error codes (NO_MEMBERSHIP/NO_TENANT_DATABASE/
// NO_TENANT_ASSIGNMENT) the plan specifies.
//
// HTTP status codes are resolved from each DomainError's statusCode (via
// ApplicationResult.statusCode), NOT via controller-side `if (result.error.code
// === 'NO_MEMBERSHIP')` branching — this matches ../businessUseCases.js's/
// ../controllers/businessController.js's established convention (single
// source of truth on the DomainError, no status-code-to-error-code mapping
// duplicated in the controller). Specific error codes the plan calls out
// (NO_MEMBERSHIP, NO_TENANT_DATABASE, NO_TENANT_ASSIGNMENT) are still
// surfaced via `error.details.error_code` for test assertions and clients.

const validationError = (message) => new DomainError(
    DomainErrorCode.VALIDATION_FAILED,
    message,
    { statusCode: 400 }
);

const noMembershipError = () => new DomainError(
    DomainErrorCode.AUTHORIZATION_FAILED,
    'You are not a member of this business.',
    { statusCode: 403, details: { error_code: 'NO_MEMBERSHIP' } }
);

const noTenantAssignmentError = () => new DomainError(
    DomainErrorCode.AUTHORIZATION_FAILED,
    'You do not have an active tenant-local staff assignment for this business.',
    { statusCode: 403, details: { error_code: 'NO_TENANT_ASSIGNMENT' } }
);

const noTenantDatabaseError = () => new DomainError(
    DomainErrorCode.RESOURCE_NOT_FOUND,
    'No tenant database is registered for this business.',
    { statusCode: 404, details: { error_code: 'NO_TENANT_DATABASE' } }
);

const serviceUnavailableError = (message) => new DomainError(
    DomainErrorCode.SERVICE_UNAVAILABLE,
    message,
    { statusCode: 503 }
);

/**
 * Shared API-04 tenant session resolution algorithm, used by both
 * buildCreateTenantSessionUseCase (first activation) and
 * buildActivateBusinessSessionUseCase (mid-session switch) — per the plan's
 * own note that activation "Uses same validation as CreateTenantSession".
 *
 * Step 1: validate landlord membership exists.
 * Step 2: resolve tenant database pointer via BusinessDatabaseRegistry.
 * Step 3: validate tenant-local assignment (skipped for owners — D-04/D-14's
 *   explicit "authorized scope" exception).
 * Step 4: build and return the session context.
 *
 * @param {{businessRepository, businessDatabaseRegistry, accountStaffAssignmentRepository}} deps
 * @param {{businessId, accountId}} input
 */
async function resolveTenantSession(
    { businessRepository, businessDatabaseRegistry, accountStaffAssignmentRepository },
    { businessId, accountId }
) {
    if (!businessId || !accountId) {
        return ApplicationResult.failure(validationError('businessId and accountId are required.'));
    }

    // Step 1: landlord membership (API-04 part 1).
    const membership = await businessRepository.getMembership(accountId, businessId);
    if (!membership || membership.status !== 'active') {
        return ApplicationResult.failure(noMembershipError());
    }

    // Step 2: resolve tenant database pointer.
    if (!businessDatabaseRegistry) {
        return ApplicationResult.failure(
            serviceUnavailableError('Tenant database registry is not configured.')
        );
    }
    const registryEntry = await businessDatabaseRegistry.findByBusinessId(businessId);
    if (!registryEntry || !registryEntry.database_name) {
        return ApplicationResult.failure(noTenantDatabaseError());
    }

    // Step 3: tenant-local assignment (API-04 part 2) — business owners
    // bypass this requirement (explicit "authorized scope" exception).
    let activeAssignment = null;
    if (membership.role !== 'owner') {
        activeAssignment = await accountStaffAssignmentRepository.findActiveAssignment(
            registryEntry.database_name,
            accountId
        );
        if (!activeAssignment) {
            return ApplicationResult.failure(noTenantAssignmentError());
        }
    }

    // Step 4: build session context.
    return ApplicationResult.success({
        business_id: businessId,
        tenant_database: registryEntry.database_name,
        dgfy_account_id: accountId,
        active_assignment: activeAssignment,
        timestamp: new Date().toISOString()
    });
}

/**
 * Tenant session creation use case (API-04 enforcement).
 * @param {{businessRepository, businessDatabaseRegistry, accountStaffAssignmentRepository}} deps
 */
export function buildCreateTenantSessionUseCase(deps) {
    return async (input = {}) => resolveTenantSession(deps, input);
}

/**
 * Mid-session business activation/switch use case (D-14) — no re-login
 * required; uses the same session token as CreateTenantSession, applying
 * the identical membership + assignment validation.
 * @param {{businessRepository, businessDatabaseRegistry, accountStaffAssignmentRepository}} deps
 */
export function buildActivateBusinessSessionUseCase(deps) {
    return async (input = {}) => resolveTenantSession(deps, input);
}

export default { buildCreateTenantSessionUseCase, buildActivateBusinessSessionUseCase };
