import { DomainError, DomainErrorCode } from '../../../shared/contracts/domainErrors.js';
import { evaluateComplianceDecision } from '../policy/policyEngine.js';
import { COMPLIANCE_DECISION, COMPLIANCE_MODE_STATE } from '../policy/constants.js';

// complianceGate.js — the FSC-02 shared gate port, Phase 9's hand-off
// contract. `buildAssertComplianceGate({ repository })` closes
// assertComplianceGate({ businessId, operation, requestedDocumentContext })
// over a ComplianceModeStateRepository instance: it loads the tenant's
// current compliance_mode_state row, builds the pure-function
// evaluateComplianceDecision() context (../policy/policyEngine.js — the
// D-05-deviated port), and maps ALLOW -> return the decision,
// DENY -> throw forbiddenError, REQUIRES_SETUP -> throw a domain error
// carrying the reason code. This is the ONLY place a gated usecase in this
// codebase should call the policy engine (research Pattern A — never
// middleware, never a scattered per-call-site check).
//
// This phase's gated usecases (shift-open, per 08-05-PLAN.md's optional
// assertComplianceGate parameter) do NOT actually call this gate yet — Phase
// 9 wires every real call site (checkout, shift-open, receipt render).
// Building it here now means the shape (especially requestedDocumentContext
// as a first-class input, D-05) is stable and documented before Phase 9
// planning starts.
//
// No artifact/peripheral/settings persistence exists yet this phase (that is
// a Phase 9+ concern) — assertComplianceGate accepts artifacts/peripherals/
// settings/evidence as optional pass-through inputs (defaulting to empty).
//
// CR-02/FSC-02 gap-closure (08-09-PLAN.md Task 3): for a compliant_active
// business, ../policy/policyEngine.js's POS-operation decision branch now
// consults the FULL evidence-derived checklist evaluateComplianceChecklist()
// computes — all seven readiness signals (profile, settings, artifacts,
// peripherals, plus fiscal-accumulator-stream, audit-log append-only
// enforcement, payment-handoff policy, encryption prerequisites, documentary/
// submission-artifact readiness, RMO 24-2023 filing readiness, and fiscal
// terminal registration, rolled up as checklist.ready_for_compliant_activation)
// — before returning ALLOW. So a compliant_active business with no submitted
// checklist evidence (artifacts/peripherals/settings/evidence all defaulting
// to empty here) correctly falls through to REQUIRES_SETUP, mapped to the
// specific unmet signal's own reason code (e.g. RMO_FILING_EVIDENCE_REQUIRED,
// FISCAL_TERMINAL_REGISTRATION_REQUIRED) via checklist.activation_blockers —
// the gate never silently assumes completeness for any of the seven signals.

const validationError = (message, details = null) => new DomainError(
    DomainErrorCode.VALIDATION_FAILED,
    message,
    { statusCode: 400, details }
);

const forbiddenError = (decision) => new DomainError(
    DomainErrorCode.AUTHORIZATION_FAILED,
    'This operation is not allowed under the current compliance-mode state.',
    { statusCode: 403, details: { reason_code: decision.reason_code, decision } }
);

const requiresSetupError = (decision) => new DomainError(
    DomainErrorCode.CONFLICT,
    'This operation requires completing the compliance activation checklist first.',
    { statusCode: 409, details: { reason_code: decision.reason_code, decision } }
);

const noTenantDatabaseError = () => new DomainError(
    DomainErrorCode.RESOURCE_NOT_FOUND,
    'No tenant database is registered for this business.',
    { statusCode: 404, details: { error_code: 'NO_TENANT_DATABASE' } }
);

const isTenantDatabaseUnavailableError = (error) => Boolean(error) && error.name === 'TenantDatabaseUnavailableError';

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
 * @param {{repository}} deps - repository = ComplianceModeStateRepository
 * @returns {(input: {businessId: string, branchId?: number|null, operation: string, requestedDocumentContext?: string, artifacts?: Array, peripherals?: Array, settings?: Object, evidence?: Object, now?: Date}) => Promise<Object>}
 *   Returns the ALLOW decision object on success; throws a DomainError
 *   (403 for DENY, 409 for REQUIRES_SETUP) otherwise.
 */
export function buildAssertComplianceGate({ repository }) {
    if (!repository) {
        throw new Error('buildAssertComplianceGate requires a repository (ComplianceModeStateRepository).');
    }

    return async function assertComplianceGate(input = {}) {
        const {
            businessId,
            branchId = null,
            operation,
            requestedDocumentContext,
            artifacts = [],
            peripherals = [],
            settings = {},
            evidence = {},
            now = new Date()
        } = input;

        if (!businessId) {
            throw validationError('assertComplianceGate requires businessId.');
        }
        if (!operation) {
            throw validationError('assertComplianceGate requires operation.');
        }

        let stateRow;
        try {
            stateRow = await repository.getForBusinessBranch(businessId, branchId);
        } catch (tenantError) {
            if (isTenantDatabaseUnavailableError(tenantError)) {
                throw mapTenantDatabaseError(tenantError);
            }
            throw tenantError;
        }

        const tenant = {
            id: businessId,
            compliance_mode_state: stateRow?.state || COMPLIANCE_MODE_STATE.NON_COMPLIANT_ACTIVE,
            compliance_profile: stateRow?.compliance_profile || null,
            // Legacy-mode-choice selection (COMPLIANCE_MODE_CHOICES) is not a
            // Phase 8 concern — every business here has already implicitly
            // chosen (non_compliant_active is the default state, D-02), so
            // this always resolves to false.
            compliance_mode_choice_required: false
        };

        const decision = evaluateComplianceDecision({
            tenant,
            operation,
            context: { requested_document_context: requestedDocumentContext },
            artifacts,
            peripherals,
            settings,
            evidence,
            now
        });

        if (decision.decision === COMPLIANCE_DECISION.DENY) {
            throw forbiddenError(decision);
        }
        if (decision.decision === COMPLIANCE_DECISION.REQUIRES_SETUP) {
            throw requiresSetupError(decision);
        }

        return decision;
    };
}

export default buildAssertComplianceGate;
