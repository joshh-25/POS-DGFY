// constants.js — verbatim port of the read-only legacy
// backend/src/modules/compliance/policy/complianceConstants.js (D-02/D-03).
// All 8 frozen enum objects are ported byte-for-byte (values unchanged) so
// the tenant-scoped compliance-mode state machine (models/Tenant/
// ComplianceModeState.js) and the ported policy engine (./policyEngine.js)
// share the exact same vocabulary the legacy engine used — no renaming, no
// reshaping. This file carries NO logic, only frozen constant objects.
//
// DOCUMENT_CONTEXTS and POS_OPERATIONS are additionally hoisted here (they
// live inline inside compliancePolicyEngine.js in legacy, not in
// complianceConstants.js) so every consumer of the D-05 first-class
// `requestedDocumentContext` input (this policy engine, modules/compliance's
// usecases, and Phase 9's call sites) imports the same single source of
// truth instead of each redefining its own copy.

export const COMPLIANCE_MODE_STATE = Object.freeze({
    NON_COMPLIANT_ACTIVE: 'non_compliant_active',
    COMPLIANT_PENDING: 'compliant_pending',
    COMPLIANT_ACTIVE: 'compliant_active'
});

export const COMPLIANCE_DECISION = Object.freeze({
    ALLOW: 'allow',
    DENY: 'deny',
    REQUIRES_SETUP: 'requires_setup'
});

export const COMPLIANCE_OPERATION = Object.freeze({
    POS_CHECKOUT: 'pos.checkout',
    POS_TERMINAL_OPERATION: 'pos.terminal_operation',
    RECEIPT_RENDER: 'pos.receipt_render',
    SETTINGS_UPDATE: 'settings.update',
    PAYMENT_CAPABILITY_ENABLE: 'payments.capability_enable',
    REQUEST_PREFLIGHT: 'compliance.request_preflight'
});

export const COMPLIANCE_REASON_CODE = Object.freeze({
    ALLOWED: 'ALLOWED',
    LEGACY_MODE_SELECTION_REQUIRED: 'LEGACY_MODE_SELECTION_REQUIRED',
    MODE_TRANSITION_NOT_ALLOWED: 'MODE_TRANSITION_NOT_ALLOWED',
    COMPLIANT_ACTIVATION_PENDING: 'COMPLIANT_ACTIVATION_PENDING',
    COMPLIANCE_PROFILE_INCOMPLETE: 'COMPLIANCE_PROFILE_INCOMPLETE',
    COMPLIANCE_SETTINGS_INCOMPLETE: 'COMPLIANCE_SETTINGS_INCOMPLETE',
    COMPLIANCE_ARTIFACTS_INCOMPLETE: 'COMPLIANCE_ARTIFACTS_INCOMPLETE',
    ACCREDITED_PERIPHERAL_REQUIRED: 'ACCREDITED_PERIPHERAL_REQUIRED',
    READINESS_TESTS_REQUIRED: 'READINESS_TESTS_REQUIRED',
    NON_COMPLIANT_FISCAL_DOCUMENT_BLOCKED: 'NON_COMPLIANT_FISCAL_DOCUMENT_BLOCKED',
    NON_COMPLIANT_FISCAL_FIELDS_BLOCKED: 'NON_COMPLIANT_FISCAL_FIELDS_BLOCKED',
    // NOTE (D-05): this reason code is ported here for constant-set fidelity
    // with legacy, but ./policyEngine.js's ported evaluateComplianceDecision
    // deliberately no longer PRODUCES it for compliant_active — the branch
    // that used to return it has been removed (see policyEngine.js's header
    // comment and 08-CONTEXT.md D-05).
    DOCUMENT_CONTEXT_NOT_ALLOWED: 'DOCUMENT_CONTEXT_NOT_ALLOWED',
    COMPLIANT_MODE_FAIL_CLOSED: 'COMPLIANT_MODE_FAIL_CLOSED',
    BSP_OPS_REGISTRATION_REQUIRED: 'BSP_OPS_REGISTRATION_REQUIRED',
    BSP_PAYMENT_CONTROL_REQUIRED: 'BSP_PAYMENT_CONTROL_REQUIRED',
    IMPACT_DECLARATION_REQUIRED: 'IMPACT_DECLARATION_REQUIRED',
    VERIFICATION_REQUIRED: 'VERIFICATION_REQUIRED',
    TERMINAL_DEVICE_MISMATCH: 'TERMINAL_DEVICE_MISMATCH',
    MASTER_ADMIN_REQUIRED: 'MASTER_ADMIN_REQUIRED',
    RMO_FILING_EVIDENCE_REQUIRED: 'RMO_FILING_EVIDENCE_REQUIRED',
    FISCAL_TERMINAL_REGISTRATION_REQUIRED: 'FISCAL_TERMINAL_REGISTRATION_REQUIRED'
});

export const COMPLIANCE_VERIFICATION_STATUS = Object.freeze({
    PENDING_REVIEW: 'pending_review',
    VERIFIED: 'verified',
    REJECTED: 'rejected',
    REVOKED: 'revoked'
});

// D-04: state transitions are manual — an authorized staff/owner submits
// evidence (COMPLIANCE_VERIFICATION_STATUS.PENDING_REVIEW); a reviewer with
// one of these two verifier actor types reviews and transitions state.
export const COMPLIANCE_VERIFIER_ACTOR_TYPE = Object.freeze({
    TENANT_MASTER_ADMIN: 'tenant_master_admin',
    PLATFORM_ADMIN: 'platform_admin'
});

export const COMPLIANCE_PROFILE_DEFAULT = Object.freeze({
    bir: {
        software_accreditation_number: '',
        software_accreditation_valid_until: '',
        ptu_certificate_number: '',
        tax_classification_controls_confirmed: false,
        non_resettable_grand_total_enabled: false,
        mandatory_receipt_fields_confirmed: false,
        rmo_24_2023_filing_verified: false,
        fiscal_document_content_reviewed: false,
        terminal_registration_controls_confirmed: false,
        ejournal_integrity_controls_confirmed: false,
        esales_reporting_controls_confirmed: false
    },
    npc: {
        dpo_name: '',
        dpo_email: '',
        dps_registration_number: '',
        dps_registration_valid_until: '',
        breach_notification_procedure_confirmed: false
    },
    bsp: {
        ops_registration_required: false,
        ops_registration_status: 'not_required',
        ops_registration_number: '',
        ops_registration_valid_until: '',
        payment_control_reviewed: false
    },
    readiness: {
        tests_passed: false,
        last_tested_at: ''
    }
});

export const COMPLIANCE_MODE_CHOICES = Object.freeze({
    NON_COMPLIANT: 'non_compliant',
    COMPLIANT: 'compliant'
});

// D-05: the per-request document-context input the client (which app build
// is running — Omni vs Fiscal) supplies. The engine only gates eligibility
// by compliance-mode state against this value; it never forces one.
export const DOCUMENT_CONTEXTS = Object.freeze({
    FISCAL: 'fiscal',
    NON_FISCAL: 'non_fiscal',
    TRAINING_TEST: 'training_test'
});

// The subset of COMPLIANCE_OPERATION values that are POS/receipt surfaces —
// the only operations the D-05 requestedDocumentContext gating applies to.
export const POS_OPERATIONS = Object.freeze([
    COMPLIANCE_OPERATION.POS_CHECKOUT,
    COMPLIANCE_OPERATION.POS_TERMINAL_OPERATION,
    COMPLIANCE_OPERATION.RECEIPT_RENDER
]);
