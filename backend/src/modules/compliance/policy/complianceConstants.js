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
    DOCUMENT_CONTEXT_NOT_ALLOWED: 'DOCUMENT_CONTEXT_NOT_ALLOWED',
    COMPLIANT_MODE_FAIL_CLOSED: 'COMPLIANT_MODE_FAIL_CLOSED',
    BSP_OPS_REGISTRATION_REQUIRED: 'BSP_OPS_REGISTRATION_REQUIRED',
    BSP_PAYMENT_CONTROL_REQUIRED: 'BSP_PAYMENT_CONTROL_REQUIRED',
    IMPACT_DECLARATION_REQUIRED: 'IMPACT_DECLARATION_REQUIRED',
    VERIFICATION_REQUIRED: 'VERIFICATION_REQUIRED',
    TERMINAL_DEVICE_MISMATCH: 'TERMINAL_DEVICE_MISMATCH',
    MASTER_ADMIN_REQUIRED: 'MASTER_ADMIN_REQUIRED'
});

export const COMPLIANCE_VERIFICATION_STATUS = Object.freeze({
    PENDING_REVIEW: 'pending_review',
    VERIFIED: 'verified',
    REJECTED: 'rejected',
    REVOKED: 'revoked'
});

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
        mandatory_receipt_fields_confirmed: false
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
