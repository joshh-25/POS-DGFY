import {
    evaluateComplianceDecision
} from '../src/modules/compliance/policy/compliancePolicyEngine.js';
import {
    COMPLIANCE_MODE_STATE,
    COMPLIANCE_OPERATION,
    COMPLIANCE_REASON_CODE,
    COMPLIANCE_DECISION
} from '../src/modules/compliance/policy/complianceConstants.js';

const buildTenantProfile = () => ({
    bir: {
        software_accreditation_number: 'BIR-ACC-001',
        software_accreditation_valid_until: '2030-12-31',
        ptu_certificate_number: 'PTU-001',
        tax_classification_controls_confirmed: true,
        non_resettable_grand_total_enabled: true,
        mandatory_receipt_fields_confirmed: true
    },
    npc: {
        dpo_name: 'Jane DPO',
        dpo_email: 'dpo@example.com',
        dps_registration_number: 'DPS-001',
        dps_registration_valid_until: '2030-12-31',
        breach_notification_procedure_confirmed: true
    },
    bsp: {
        ops_registration_required: false,
        ops_registration_status: 'not_required',
        payment_control_reviewed: true
    },
    readiness: {
        tests_passed: true,
        last_tested_at: '2026-04-07T00:00:00.000Z'
    }
});

const buildSettings = () => ({
    pos_business_name: { value: 'Demo Store' },
    pos_tin_branch: { value: '123-456-789-000' },
    pos_address: { value: 'Iloilo City' },
    pos_ptu_number: { value: 'PTU-123' },
    pos_min_number: { value: 'MIN-123' },
    pos_accreditation_number: { value: 'ACC-123' }
});

const buildArtifacts = () => ([
    {
        artifact_type: 'bir_accreditation_certificate',
        status: 'valid',
        verification_status: 'verified',
        valid_until: '2030-12-31'
    },
    {
        artifact_type: 'bir_ptu_document',
        status: 'valid',
        verification_status: 'verified',
        valid_until: '2030-12-31'
    },
    {
        artifact_type: 'npc_dps_certificate',
        status: 'valid',
        verification_status: 'verified',
        valid_until: '2030-12-31'
    }
]);

describe('compliancePolicyEngine', () => {
    it('denies fiscal receipt render in non-compliant mode', () => {
        const decision = evaluateComplianceDecision({
            tenant: {
                id: 'tenant-1',
                compliance_mode_state: COMPLIANCE_MODE_STATE.NON_COMPLIANT_ACTIVE,
                compliance_mode_choice_required: false,
                compliance_profile: {}
            },
            operation: COMPLIANCE_OPERATION.RECEIPT_RENDER,
            context: { requested_document_type: 'fiscal_invoice' }
        });

        expect(decision.decision).toBe(COMPLIANCE_DECISION.DENY);
        expect(decision.reason_code).toBe(COMPLIANCE_REASON_CODE.NON_COMPLIANT_FISCAL_DOCUMENT_BLOCKED);
    });

    it('denies compliant terminal operation when accredited classes do not match terminal binding', () => {
        const decision = evaluateComplianceDecision({
            tenant: {
                id: 'tenant-2',
                compliance_mode_state: COMPLIANCE_MODE_STATE.COMPLIANT_ACTIVE,
                compliance_mode_choice_required: false,
                compliance_profile: buildTenantProfile()
            },
            operation: COMPLIANCE_OPERATION.POS_TERMINAL_OPERATION,
            context: { terminal_id: 'TERM-B' },
            artifacts: buildArtifacts(),
            peripherals: [
                {
                    device_class: 'receipt_printer',
                    terminal_id: 'TERM-A',
                    is_shared: false,
                    status: 'accredited',
                    verification_status: 'verified',
                    accreditation_valid_until: '2030-12-31'
                },
                {
                    device_class: 'cash_drawer',
                    terminal_id: 'TERM-A',
                    is_shared: false,
                    status: 'accredited',
                    verification_status: 'verified',
                    accreditation_valid_until: '2030-12-31'
                }
            ],
            settings: buildSettings()
        });

        expect(decision.decision).toBe(COMPLIANCE_DECISION.DENY);
        expect(decision.reason_code).toBe(COMPLIANCE_REASON_CODE.TERMINAL_DEVICE_MISMATCH);
    });

    it('allows compliant terminal operation when required classes are satisfied via shared fallback', () => {
        const decision = evaluateComplianceDecision({
            tenant: {
                id: 'tenant-3',
                compliance_mode_state: COMPLIANCE_MODE_STATE.COMPLIANT_ACTIVE,
                compliance_mode_choice_required: false,
                compliance_profile: buildTenantProfile()
            },
            operation: COMPLIANCE_OPERATION.POS_TERMINAL_OPERATION,
            context: { terminal_id: 'TERM-B' },
            artifacts: buildArtifacts(),
            peripherals: [
                {
                    device_class: 'receipt_printer',
                    terminal_id: null,
                    is_shared: true,
                    status: 'accredited',
                    verification_status: 'verified',
                    accreditation_valid_until: '2030-12-31'
                },
                {
                    device_class: 'cash_drawer',
                    terminal_id: null,
                    is_shared: true,
                    status: 'accredited',
                    verification_status: 'verified',
                    accreditation_valid_until: '2030-12-31'
                }
            ],
            settings: buildSettings()
        });

        expect(decision.decision).toBe(COMPLIANCE_DECISION.ALLOW);
        expect(decision.reason_code).toBe(COMPLIANCE_REASON_CODE.ALLOWED);
    });
});
