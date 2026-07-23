import { evaluateComplianceDecision } from '../../../../src/modules/compliance/policy/policyEngine.js';
import {
    COMPLIANCE_MODE_STATE,
    COMPLIANCE_DECISION,
    COMPLIANCE_OPERATION,
    COMPLIANCE_REASON_CODE
} from '../../../../src/modules/compliance/policy/constants.js';

// CR-02/FSC-02 gap-closure guard (08-09-PLAN.md Task 3) — pins that the
// compliant_active POS-operation branch now gates its final ALLOW on the
// FULL evidence-derived checklist (checklist.ready_for_compliant_activation)
// rather than only profile/settings/artifacts/peripherals. Re-declares
// equivalent fully-ready fixture builders to complianceGate.test.js's
// buildFullyCompliantProfile()/buildFullSettings()/buildFullArtifacts()/
// buildFullPeripherals()/buildFullEvidence() (per 08-09-PLAN.md's action,
// "reuse this fixture shape in the new test") so a fully-ready bundle never
// itself blocks the decision — isolating each test to exactly ONE knocked-out
// evidence-derived signal.

const FAR_FUTURE_DATE = '2099-01-01';

const buildFullyCompliantProfile = () => ({
    bir: {
        software_accreditation_number: 'ACC-0001',
        software_accreditation_valid_until: FAR_FUTURE_DATE,
        ptu_certificate_number: 'PTU-0001',
        tax_classification_controls_confirmed: true,
        non_resettable_grand_total_enabled: true,
        mandatory_receipt_fields_confirmed: true,
        rmo_24_2023_filing_verified: true,
        fiscal_document_content_reviewed: true,
        terminal_registration_controls_confirmed: true,
        ejournal_integrity_controls_confirmed: true,
        esales_reporting_controls_confirmed: true
    },
    npc: {
        dpo_name: 'Jane Doe',
        dpo_email: 'jane@example.com',
        dps_registration_number: 'DPS-0001',
        dps_registration_valid_until: FAR_FUTURE_DATE,
        breach_notification_procedure_confirmed: true
    },
    bsp: {
        ops_registration_required: false,
        ops_registration_status: 'not_required',
        ops_registration_number: '',
        ops_registration_valid_until: '',
        payment_control_reviewed: false
    },
    readiness: {
        tests_passed: true,
        last_tested_at: FAR_FUTURE_DATE
    }
});

const buildFullSettings = () => ({
    pos_business_name: { value: 'Acme Store' },
    pos_tin_branch: { value: '000-000-000-0000' },
    pos_address: { value: '123 Main St' },
    pos_ptu_number: { value: 'PTU-0001' },
    pos_min_number: { value: 'MIN-0001' },
    pos_accreditation_number: { value: 'ACC-0001' }
});

const buildFullArtifacts = () => ([
    { artifact_type: 'bir_accreditation_certificate', verification_status: 'verified', status: 'valid', valid_until: FAR_FUTURE_DATE },
    { artifact_type: 'bir_ptu_document', verification_status: 'verified', status: 'valid', valid_until: FAR_FUTURE_DATE },
    { artifact_type: 'npc_dps_certificate', verification_status: 'verified', status: 'valid', valid_until: FAR_FUTURE_DATE }
]);

const buildFullPeripherals = () => ([
    { device_class: 'receipt_printer', verification_status: 'verified', status: 'accredited', accreditation_valid_until: FAR_FUTURE_DATE, is_shared: true },
    { device_class: 'cash_drawer', verification_status: 'verified', status: 'accredited', accreditation_valid_until: FAR_FUTURE_DATE, is_shared: true }
]);

const buildFullEvidence = () => ({
    fiscal_accumulator_stream_ready: true,
    audit_log_append_only_enforced: true,
    payment_handoff_policy_ready: true,
    encryption_policy_prerequisites_ready: true,
    submission_artifacts: { ready: true, complete: 1, total: 1, missing: 0, items: [] },
    rmo_filing_readiness: { ready: true, complete: 1, total: 1, missing: 0, items: [] },
    fiscal_terminal_registration: { ready: true, verified_count: 1, total_count: 1 }
});

const buildCompliantActiveDecision = ({
    requestedDocumentContext = 'non_fiscal',
    operation = COMPLIANCE_OPERATION.POS_CHECKOUT,
    evidenceOverrides = null
} = {}) => evaluateComplianceDecision({
    tenant: {
        id: 'biz-1',
        compliance_mode_state: COMPLIANCE_MODE_STATE.COMPLIANT_ACTIVE,
        compliance_profile: buildFullyCompliantProfile()
    },
    operation,
    context: { requested_document_context: requestedDocumentContext },
    artifacts: buildFullArtifacts(),
    peripherals: buildFullPeripherals(),
    settings: buildFullSettings(),
    evidence: evidenceOverrides === null ? buildFullEvidence() : evidenceOverrides
});

describe('CR-02/FSC-02: compliant_active POS gate enforces the full evidence-derived checklist', () => {
    test('baseline: fully-ready evidence bundle -> ALLOW (Option A does not over-block the happy path)', () => {
        const decision = buildCompliantActiveDecision({});
        expect(decision.decision).toBe(COMPLIANCE_DECISION.ALLOW);
        expect(decision.reason_code).toBe(COMPLIANCE_REASON_CODE.ALLOWED);
        expect(decision.checklist.ready_for_compliant_activation).toBe(true);
    });

    test('rmo_filing_readiness.ready = false -> REQUIRES_SETUP RMO_FILING_EVIDENCE_REQUIRED', () => {
        const decision = buildCompliantActiveDecision({
            evidenceOverrides: {
                ...buildFullEvidence(),
                rmo_filing_readiness: { ready: false, complete: 0, total: 1, missing: 1, items: [] }
            }
        });
        expect(decision.decision).toBe(COMPLIANCE_DECISION.REQUIRES_SETUP);
        expect(decision.reason_code).toBe(COMPLIANCE_REASON_CODE.RMO_FILING_EVIDENCE_REQUIRED);
    });

    test('fiscal_terminal_registration.ready = false -> REQUIRES_SETUP FISCAL_TERMINAL_REGISTRATION_REQUIRED', () => {
        const decision = buildCompliantActiveDecision({
            evidenceOverrides: {
                ...buildFullEvidence(),
                fiscal_terminal_registration: { ready: false, verified_count: 0, total_count: 1 }
            }
        });
        expect(decision.decision).toBe(COMPLIANCE_DECISION.REQUIRES_SETUP);
        expect(decision.reason_code).toBe(COMPLIANCE_REASON_CODE.FISCAL_TERMINAL_REGISTRATION_REQUIRED);
    });

    test('audit_log_append_only_enforced = false -> REQUIRES_SETUP VERIFICATION_REQUIRED', () => {
        const decision = buildCompliantActiveDecision({
            evidenceOverrides: {
                ...buildFullEvidence(),
                audit_log_append_only_enforced: false
            }
        });
        expect(decision.decision).toBe(COMPLIANCE_DECISION.REQUIRES_SETUP);
        expect(decision.reason_code).toBe(COMPLIANCE_REASON_CODE.VERIFICATION_REQUIRED);
    });

    test('payment_handoff_policy_ready = false -> REQUIRES_SETUP BSP_PAYMENT_CONTROL_REQUIRED', () => {
        const decision = buildCompliantActiveDecision({
            evidenceOverrides: {
                ...buildFullEvidence(),
                payment_handoff_policy_ready: false
            }
        });
        expect(decision.decision).toBe(COMPLIANCE_DECISION.REQUIRES_SETUP);
        expect(decision.reason_code).toBe(COMPLIANCE_REASON_CODE.BSP_PAYMENT_CONTROL_REQUIRED);
    });

    test('encryption_policy_prerequisites_ready = false -> REQUIRES_SETUP COMPLIANT_MODE_FAIL_CLOSED', () => {
        const decision = buildCompliantActiveDecision({
            evidenceOverrides: {
                ...buildFullEvidence(),
                encryption_policy_prerequisites_ready: false
            }
        });
        expect(decision.decision).toBe(COMPLIANCE_DECISION.REQUIRES_SETUP);
        expect(decision.reason_code).toBe(COMPLIANCE_REASON_CODE.COMPLIANT_MODE_FAIL_CLOSED);
    });

    test('empty-evidence guard: evidence {} -> REQUIRES_SETUP (NOT ALLOW) — the header-comment guarantee now holds', () => {
        const decision = buildCompliantActiveDecision({ evidenceOverrides: {} });
        expect(decision.decision).toBe(COMPLIANCE_DECISION.REQUIRES_SETUP);
        expect(decision.decision).not.toBe(COMPLIANCE_DECISION.ALLOW);
        expect(decision.checklist.ready_for_compliant_activation).toBe(false);
    });

    test('D-05 preserved under the new gating: fully-ready compliant_active + non_fiscal -> ALLOW', () => {
        const decision = buildCompliantActiveDecision({ requestedDocumentContext: 'non_fiscal' });
        expect(decision.decision).toBe(COMPLIANCE_DECISION.ALLOW);
        expect(decision.reason_code).toBe(COMPLIANCE_REASON_CODE.ALLOWED);
    });

    test('D-05 preserved under the new gating: fully-ready compliant_active + fiscal -> ALLOW', () => {
        const decision = buildCompliantActiveDecision({ requestedDocumentContext: 'fiscal' });
        expect(decision.decision).toBe(COMPLIANCE_DECISION.ALLOW);
        expect(decision.reason_code).toBe(COMPLIANCE_REASON_CODE.ALLOWED);
    });

    test('partial evidence bundle: only rmo_filing_readiness + fiscal_terminal_registration supplied, all five other evidence-derived signals omitted -> REQUIRES_SETUP (NOT ALLOW)', () => {
        const decision = buildCompliantActiveDecision({
            evidenceOverrides: {
                rmo_filing_readiness: { ready: true, complete: 1, total: 1, missing: 0, items: [] },
                fiscal_terminal_registration: { ready: true, verified_count: 1, total_count: 1 }
            }
        });
        expect(decision.decision).toBe(COMPLIANCE_DECISION.REQUIRES_SETUP);
        expect(decision.decision).not.toBe(COMPLIANCE_DECISION.ALLOW);
        expect(decision.checklist.ready_for_compliant_activation).toBe(false);
        expect(decision.reason_code).toBe(COMPLIANCE_REASON_CODE.COMPLIANT_MODE_FAIL_CLOSED);
    });
});
