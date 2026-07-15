import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { evaluateComplianceDecision } from '../../../../src/modules/compliance/policy/policyEngine.js';
import {
    COMPLIANCE_MODE_STATE,
    COMPLIANCE_DECISION,
    COMPLIANCE_OPERATION,
    COMPLIANCE_REASON_CODE
} from '../../../../src/modules/compliance/policy/constants.js';

// D-05 regression guard (08-06-PLAN.md Task 1) — the single most important
// behavioral change in Phase 8. Exercises evaluateComplianceDecision()
// directly at the policy-engine level (usecases/complianceGate.js, built in
// Task 2, is a thin loader/mapper around this same function — Task 1 has no
// dependency on it existing yet).

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const POLICY_ENGINE_PATH = path.resolve(__dirname, '../../../../src/modules/compliance/policy/policyEngine.js');

// A fully "ready_for_compliant_activation" profile/artifacts/peripherals/
// settings/evidence bundle so evaluateComplianceChecklist() (invoked for
// every POS_OPERATIONS entry once modeState === compliant_active) never
// itself blocks the decision — isolating the assertions to exactly the D-05
// requestedDocumentContext behavior under test, not checklist completeness.
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

const buildCompliantActiveDecision = (requestedDocumentContext, operation = COMPLIANCE_OPERATION.POS_CHECKOUT) => evaluateComplianceDecision({
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
    evidence: buildFullEvidence()
});

describe('D-05: compliance gate policy engine — Omni-default, Fiscal-on-request', () => {
    test('(a) compliant_active + non_fiscal + POS operation -> ALLOW (the exact case legacy denies)', () => {
        const decision = buildCompliantActiveDecision('non_fiscal');
        expect(decision.decision).toBe(COMPLIANCE_DECISION.ALLOW);
        expect(decision.reason_code).toBe(COMPLIANCE_REASON_CODE.ALLOWED);
    });

    test('(b) compliant_active + fiscal -> ALLOW', () => {
        const decision = buildCompliantActiveDecision('fiscal');
        expect(decision.decision).toBe(COMPLIANCE_DECISION.ALLOW);
        expect(decision.reason_code).toBe(COMPLIANCE_REASON_CODE.ALLOWED);
    });

    test('(c) non_compliant_active + fiscal -> DENY NON_COMPLIANT_FISCAL_DOCUMENT_BLOCKED', () => {
        const decision = evaluateComplianceDecision({
            tenant: { id: 'biz-2', compliance_mode_state: COMPLIANCE_MODE_STATE.NON_COMPLIANT_ACTIVE },
            operation: COMPLIANCE_OPERATION.POS_CHECKOUT,
            context: { requested_document_context: 'fiscal' }
        });
        expect(decision.decision).toBe(COMPLIANCE_DECISION.DENY);
        expect(decision.reason_code).toBe(COMPLIANCE_REASON_CODE.NON_COMPLIANT_FISCAL_DOCUMENT_BLOCKED);
    });

    test('(d) compliant_pending + fiscal -> REQUIRES_SETUP COMPLIANT_ACTIVATION_PENDING', () => {
        const decision = evaluateComplianceDecision({
            tenant: { id: 'biz-3', compliance_mode_state: COMPLIANCE_MODE_STATE.COMPLIANT_PENDING },
            operation: COMPLIANCE_OPERATION.POS_CHECKOUT,
            context: { requested_document_context: 'fiscal' }
        });
        expect(decision.decision).toBe(COMPLIANCE_DECISION.REQUIRES_SETUP);
        expect(decision.reason_code).toBe(COMPLIANCE_REASON_CODE.COMPLIANT_ACTIVATION_PENDING);
    });

    test('(e) non_compliant_active + non_fiscal -> ALLOW', () => {
        const decision = evaluateComplianceDecision({
            tenant: { id: 'biz-4', compliance_mode_state: COMPLIANCE_MODE_STATE.NON_COMPLIANT_ACTIVE },
            operation: COMPLIANCE_OPERATION.POS_CHECKOUT,
            context: { requested_document_context: 'non_fiscal' }
        });
        expect(decision.decision).toBe(COMPLIANCE_DECISION.ALLOW);
        expect(decision.reason_code).toBe(COMPLIANCE_REASON_CODE.ALLOWED);
    });

    test('the ported engine source contains no DOCUMENT_CONTEXT_NOT_ALLOWED deny path for compliant_active', () => {
        const source = fs.readFileSync(POLICY_ENGINE_PATH, 'utf8');
        expect(source).not.toContain('DOCUMENT_CONTEXT_NOT_ALLOWED');
    });
});
