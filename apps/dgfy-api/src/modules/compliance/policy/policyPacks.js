// policyPacks.js — whole-file port of the read-only legacy
// backend/src/modules/compliance/policy/policyPacks.js (D-03: full
// BIR/NPC/BSP policy-pack depth, not narrowed to BIR-only). Versioned packs
// with per-regulator required settings keys / profile fields / artifacts,
// plus peripheral-class checks for compliant_active. No behavior change from
// legacy — this file carries no D-05 logic (that lives in ./policyEngine.js).

const POLICY_PACKS = [
    {
        version: '2026.04.07',
        effective_from: '2026-04-07',
        controls: {
            bir: {
                required_settings_keys: [
                    'pos_business_name',
                    'pos_tin_branch',
                    'pos_address',
                    'pos_ptu_number',
                    'pos_min_number',
                    'pos_accreditation_number'
                ],
                required_profile_fields: [
                    'bir.software_accreditation_number',
                    'bir.software_accreditation_valid_until',
                    'bir.tax_classification_controls_confirmed',
                    'bir.non_resettable_grand_total_enabled',
                    'bir.mandatory_receipt_fields_confirmed',
                    'bir.rmo_24_2023_filing_verified',
                    'bir.fiscal_document_content_reviewed',
                    'bir.terminal_registration_controls_confirmed',
                    'bir.ejournal_integrity_controls_confirmed',
                    'bir.esales_reporting_controls_confirmed'
                ],
                required_artifacts: [
                    'bir_accreditation_certificate',
                    'bir_ptu_document'
                ]
            },
            npc: {
                required_profile_fields: [
                    'npc.dpo_name',
                    'npc.dpo_email',
                    'npc.dps_registration_number',
                    'npc.dps_registration_valid_until',
                    'npc.breach_notification_procedure_confirmed'
                ],
                required_artifacts: ['npc_dps_certificate']
            },
            bsp: {
                required_profile_fields_when_ops_required: [
                    'bsp.ops_registration_status',
                    'bsp.payment_control_reviewed'
                ],
                required_artifacts_when_ops_required: ['bsp_ops_certificate']
            },
            peripherals: {
                required_classes_for_compliant_active: ['receipt_printer', 'cash_drawer']
            }
        }
    }
];

const parseDate = (value) => {
    if (!value) return null;
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
};

export const getActivePolicyPack = (now = new Date()) => {
    const nowDate = parseDate(now) || new Date();

    const candidates = POLICY_PACKS
        .map((pack) => ({
            ...pack,
            effectiveDate: parseDate(pack.effective_from)
        }))
        .filter((pack) => pack.effectiveDate && pack.effectiveDate.getTime() <= nowDate.getTime())
        .sort((a, b) => b.effectiveDate.getTime() - a.effectiveDate.getTime());

    if (candidates.length > 0) {
        return candidates[0];
    }

    return POLICY_PACKS[0];
};

export const listPolicyPacks = () => [...POLICY_PACKS];
