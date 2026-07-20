import {
    evaluateComplianceDecision,
    evaluateComplianceChecklist
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
        mandatory_receipt_fields_confirmed: true,
        rmo_24_2023_filing_verified: true,
        fiscal_document_content_reviewed: true,
        terminal_registration_controls_confirmed: true,
        ejournal_integrity_controls_confirmed: true,
        esales_reporting_controls_confirmed: true
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

const buildRmoEvidence = () => ({
    rmo_filing_readiness: {
        ready: true,
        complete: 5,
        total: 5,
        missing: 0,
        items: [
            { code: 'rmo.control_matrix', ready: true },
            { code: 'rmo.filing_authority_decision', ready: true },
            { code: 'rmo.receipt_sample_pack', ready: true },
            { code: 'rmo.fiscal_integrity_evidence', ready: true },
            { code: 'rmo.esales_reporting_plan', ready: true }
        ]
    },
    fiscal_terminal_registration: {
        ready: true,
        verified_count: 1,
        total_count: 1
    }
});

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

    it('denies internal non-cash payment flow when OPS controls are incomplete', () => {
        const profile = buildTenantProfile();
        profile.bsp.ops_registration_required = true;
        profile.bsp.ops_registration_status = 'pending';
        profile.bsp.payment_control_reviewed = false;

        const decision = evaluateComplianceDecision({
            tenant: {
                id: 'tenant-1b',
                compliance_mode_state: COMPLIANCE_MODE_STATE.NON_COMPLIANT_ACTIVE,
                compliance_mode_choice_required: false,
                compliance_profile: profile
            },
            operation: COMPLIANCE_OPERATION.POS_CHECKOUT,
            context: {
                payment_type: 'card',
                payment_handoff_mode: 'internal'
            }
        });

        expect(decision.decision).toBe(COMPLIANCE_DECISION.DENY);
        expect(decision.reason_code).toBe(COMPLIANCE_REASON_CODE.BSP_OPS_REGISTRATION_REQUIRED);
    });

    it('allows POS checkout as non-compliant operation when legacy mode selection is still required', () => {
        const decision = evaluateComplianceDecision({
            tenant: {
                id: 'tenant-mode-choice-pos',
                compliance_mode_state: null,
                compliance_mode_choice_required: true,
                compliance_profile: {}
            },
            operation: COMPLIANCE_OPERATION.POS_CHECKOUT,
            context: {
                payment_type: 'cash',
                requested_document_context: 'non_fiscal'
            }
        });

        expect(decision.decision).toBe(COMPLIANCE_DECISION.ALLOW);
        expect(decision.reason_code).toBe(COMPLIANCE_REASON_CODE.ALLOWED);
        expect(decision.mode_state).toBe(COMPLIANCE_MODE_STATE.NON_COMPLIANT_ACTIVE);
    });

    it('denies non-fiscal document contexts in compliant-active POS operations', () => {
        const decision = evaluateComplianceDecision({
            tenant: {
                id: 'tenant-ctx-1',
                compliance_mode_state: COMPLIANCE_MODE_STATE.COMPLIANT_ACTIVE,
                compliance_mode_choice_required: false,
                compliance_profile: buildTenantProfile()
            },
            operation: COMPLIANCE_OPERATION.POS_CHECKOUT,
            context: {
                requested_document_context: 'non_fiscal'
            },
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
            settings: buildSettings(),
            evidence: buildRmoEvidence()
        });

        expect(decision.decision).toBe(COMPLIANCE_DECISION.DENY);
        expect(decision.reason_code).toBe(COMPLIANCE_REASON_CODE.DOCUMENT_CONTEXT_NOT_ALLOWED);
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
            settings: buildSettings(),
            evidence: buildRmoEvidence()
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
            settings: buildSettings(),
            evidence: buildRmoEvidence()
        });

        expect(decision.decision).toBe(COMPLIANCE_DECISION.ALLOW);
        expect(decision.reason_code).toBe(COMPLIANCE_REASON_CODE.ALLOWED);
    });

    it('accepts stringified compliance_profile JSON for compliant-active checks', () => {
        const decision = evaluateComplianceDecision({
            tenant: {
                id: 'tenant-4',
                compliance_mode_state: COMPLIANCE_MODE_STATE.COMPLIANT_ACTIVE,
                compliance_mode_choice_required: false,
                compliance_profile: JSON.stringify(buildTenantProfile())
            },
            operation: COMPLIANCE_OPERATION.POS_TERMINAL_OPERATION,
            context: { terminal_id: 'TERM-C' },
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
            settings: buildSettings(),
            evidence: buildRmoEvidence()
        });

        expect(decision.decision).toBe(COMPLIANCE_DECISION.ALLOW);
        expect(decision.reason_code).toBe(COMPLIANCE_REASON_CODE.ALLOWED);
    });

    it('returns enriched requirements, section progress, and activation blockers', () => {
        const checklist = evaluateComplianceChecklist({
            tenant: {
                id: 'tenant-5',
                compliance_mode_state: COMPLIANCE_MODE_STATE.COMPLIANT_PENDING,
                compliance_profile: buildTenantProfile()
            },
            complianceProfile: buildTenantProfile(),
            artifacts: buildArtifacts(),
            peripherals: [
                {
                    device_class: 'receipt_printer',
                    terminal_id: null,
                    is_shared: true,
                    status: 'accredited',
                    verification_status: 'verified',
                    accreditation_valid_until: '2030-12-31'
                }
            ],
            settings: {
                ...buildSettings(),
                pos_accreditation_number: { value: '' }
            }
        });

        expect(Array.isArray(checklist.requirements)).toBe(true);
        expect(checklist.requirements.length).toBeGreaterThan(0);
        expect(checklist.section_progress).toEqual(expect.objectContaining({
            profile: expect.any(Object),
            settings: expect.any(Object),
            artifacts: expect.any(Object),
            peripherals: expect.any(Object)
        }));
        expect(checklist.activation_blockers).toEqual(expect.arrayContaining([
            expect.objectContaining({
                code: COMPLIANCE_REASON_CODE.COMPLIANCE_SETTINGS_INCOMPLETE,
                section: 'settings'
            }),
            expect.objectContaining({
                code: COMPLIANCE_REASON_CODE.ACCREDITED_PERIPHERAL_REQUIRED,
                section: 'peripherals'
            })
        ]));
        expect(checklist.next_blocking_step).toBeTruthy();
    });

    it('blocks activation when encryption prerequisites or documentary evidence are not ready', () => {
        const checklist = evaluateComplianceChecklist({
            tenant: {
                id: 'tenant-5b',
                compliance_mode_state: COMPLIANCE_MODE_STATE.COMPLIANT_PENDING,
                compliance_profile: buildTenantProfile()
            },
            complianceProfile: buildTenantProfile(),
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
            settings: buildSettings(),
            evidence: {
                encryption_policy_prerequisites_ready: false,
                submission_artifacts: {
                    ready: false,
                    complete: 4,
                    total: 7,
                    missing: 3,
                    items: [
                        { code: 'submission.system_flow_diagram', label: 'System flow diagram', ready: true },
                        { code: 'submission.backup_disaster_recovery_plan', label: 'Backup and DR plan', ready: false }
                    ]
                }
            }
        });

        expect(checklist.ready_for_compliant_activation).toBe(false);
        expect(checklist.activation_blockers).toEqual(expect.arrayContaining([
            expect.objectContaining({
                section: 'final_review',
                code: COMPLIANCE_REASON_CODE.COMPLIANT_MODE_FAIL_CLOSED
            }),
            expect.objectContaining({
                section: 'final_review',
                code: COMPLIANCE_REASON_CODE.VERIFICATION_REQUIRED
            })
        ]));
        expect(checklist.requirements).toEqual(expect.arrayContaining([
            expect.objectContaining({
                code: 'control.encryption_policy_prerequisites',
                status: 'missing',
                section: 'final_review'
            }),
            expect.objectContaining({
                code: 'control.documentary_readiness',
                status: 'missing',
                section: 'final_review'
            })
        ]));
    });

    it('blocks compliant activation when RMO 24-2023 filing evidence is missing', () => {
        const checklist = evaluateComplianceChecklist({
            tenant: {
                id: 'tenant-5c',
                compliance_mode_state: COMPLIANCE_MODE_STATE.COMPLIANT_PENDING,
                compliance_profile: buildTenantProfile()
            },
            complianceProfile: buildTenantProfile(),
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
            settings: buildSettings(),
            evidence: {
                rmo_filing_readiness: {
                    ready: false,
                    complete: 2,
                    total: 5,
                    missing: 3,
                    items: [
                        { code: 'rmo.control_matrix', label: 'RMO control matrix', ready: true },
                        { code: 'rmo.receipt_sample_pack', label: 'Receipt sample pack', ready: false }
                    ]
                }
            }
        });

        expect(checklist.ready_for_compliant_activation).toBe(false);
        expect(checklist.activation_blockers).toEqual(expect.arrayContaining([
            expect.objectContaining({
                section: 'final_review',
                code: COMPLIANCE_REASON_CODE.RMO_FILING_EVIDENCE_REQUIRED
            })
        ]));
        expect(checklist.requirements).toEqual(expect.arrayContaining([
            expect.objectContaining({
                code: 'control.rmo_filing_readiness',
                status: 'missing',
                section: 'final_review'
            })
        ]));
    });

    it('blocks compliant activation when no fiscal terminal registration is verified', () => {
        const checklist = evaluateComplianceChecklist({
            tenant: {
                id: 'tenant-5d',
                compliance_mode_state: COMPLIANCE_MODE_STATE.COMPLIANT_PENDING,
                compliance_profile: buildTenantProfile()
            },
            complianceProfile: buildTenantProfile(),
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
            settings: buildSettings(),
            evidence: {
                ...buildRmoEvidence(),
                fiscal_terminal_registration: {
                    ready: false,
                    verified_count: 0,
                    total_count: 1,
                    action_target: '/settings?tab=pos#fiscal-terminal-registration'
                }
            }
        });

        expect(checklist.ready_for_compliant_activation).toBe(false);
        expect(checklist.activation_blockers).toEqual(expect.arrayContaining([
            expect.objectContaining({
                section: 'settings',
                code: COMPLIANCE_REASON_CODE.FISCAL_TERMINAL_REGISTRATION_REQUIRED,
                action_target: '/settings?tab=pos#fiscal-terminal-registration'
            })
        ]));
        expect(checklist.requirements).toEqual(expect.arrayContaining([
            expect.objectContaining({
                code: 'control.fiscal_terminal_registration',
                status: 'missing',
                section: 'settings'
            })
        ]));
    });

    it('produces equivalent checklist readiness for object and stringified compliance_profile inputs', () => {
        const profileObject = buildTenantProfile();
        const basePayload = {
            tenant: {
                id: 'tenant-6',
                compliance_mode_state: COMPLIANCE_MODE_STATE.COMPLIANT_PENDING
            },
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
            settings: buildSettings(),
            evidence: buildRmoEvidence()
        };

        const checklistFromObject = evaluateComplianceChecklist({
            ...basePayload,
            complianceProfile: profileObject
        });
        const checklistFromString = evaluateComplianceChecklist({
            ...basePayload,
            complianceProfile: JSON.stringify(profileObject)
        });

        expect(checklistFromString.ready_for_compliant_activation).toBe(checklistFromObject.ready_for_compliant_activation);
        expect(checklistFromString.missing_profile_fields).toEqual(checklistFromObject.missing_profile_fields);
        expect(checklistFromString.missing_artifacts).toEqual(checklistFromObject.missing_artifacts);
        expect(checklistFromString.missing_peripheral_classes).toEqual(checklistFromObject.missing_peripheral_classes);
        expect(checklistFromString.missing_setting_keys).toEqual(checklistFromObject.missing_setting_keys);
    });

    it('marks *_valid_until profile fields as missing when dates are expired', () => {
        const now = new Date('2026-04-08T09:00:00.000Z');
        const expiredProfile = buildTenantProfile();
        expiredProfile.bir.software_accreditation_valid_until = '2026-04-01';
        expiredProfile.npc.dps_registration_valid_until = '2026-04-01';

        const checklist = evaluateComplianceChecklist({
            tenant: {
                id: 'tenant-7',
                compliance_mode_state: COMPLIANCE_MODE_STATE.COMPLIANT_PENDING
            },
            complianceProfile: expiredProfile,
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
            settings: buildSettings(),
            now
        });

        expect(checklist.ready_for_compliant_activation).toBe(false);
        expect(checklist.missing_profile_fields).toEqual(expect.arrayContaining([
            'bir.software_accreditation_valid_until',
            'npc.dps_registration_valid_until'
        ]));
    });

    it('treats string false values in required boolean fields as incomplete', () => {
        const profile = buildTenantProfile();
        profile.bir.tax_classification_controls_confirmed = 'false';
        profile.readiness.tests_passed = '0';

        const checklist = evaluateComplianceChecklist({
            tenant: {
                id: 'tenant-8',
                compliance_mode_state: COMPLIANCE_MODE_STATE.COMPLIANT_PENDING
            },
            complianceProfile: profile,
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

        expect(checklist.ready_for_compliant_activation).toBe(false);
        expect(checklist.missing_profile_fields).toEqual(expect.arrayContaining([
            'bir.tax_classification_controls_confirmed',
            'readiness.tests_passed'
        ]));
    });
});
