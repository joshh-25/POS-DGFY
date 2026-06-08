import {
    COMPLIANCE_MODE_STATE,
    COMPLIANCE_DECISION,
    COMPLIANCE_OPERATION,
    COMPLIANCE_REASON_CODE,
    COMPLIANCE_PROFILE_DEFAULT,
    COMPLIANCE_VERIFICATION_STATUS
} from './complianceConstants.js';
import { getActivePolicyPack } from './policyPacks.js';

const FISCAL_ONLY_SETTING_KEYS = new Set([
    'pos_tin_branch',
    'pos_ptu_number',
    'pos_min_number',
    'pos_accreditation_number'
]);

const POS_OPERATIONS = new Set([
    COMPLIANCE_OPERATION.POS_CHECKOUT,
    COMPLIANCE_OPERATION.POS_TERMINAL_OPERATION,
    COMPLIANCE_OPERATION.RECEIPT_RENDER
]);

const DOCUMENT_CONTEXTS = Object.freeze({
    FISCAL: 'fiscal',
    NON_FISCAL: 'non_fiscal',
    TRAINING_TEST: 'training_test'
});

const parseDate = (value) => {
    if (!value) return null;
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const BOOLEAN_PROFILE_FIELD_PATHS = new Set([
    'bir.tax_classification_controls_confirmed',
    'bir.non_resettable_grand_total_enabled',
    'bir.mandatory_receipt_fields_confirmed',
    'bir.rmo_24_2023_filing_verified',
    'bir.fiscal_document_content_reviewed',
    'bir.terminal_registration_controls_confirmed',
    'bir.ejournal_integrity_controls_confirmed',
    'bir.esales_reporting_controls_confirmed',
    'npc.breach_notification_procedure_confirmed',
    'bsp.ops_registration_required',
    'bsp.payment_control_reviewed',
    'readiness.tests_passed'
]);

const toLocalDateToken = (value) => {
    const parsed = parseDate(value);
    if (!parsed) return null;
    const year = parsed.getFullYear();
    const month = String(parsed.getMonth() + 1).padStart(2, '0');
    const day = String(parsed.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
};

const isTrueLike = (value) => {
    if (value === true || value === 1) return true;
    if (typeof value === 'string') {
        const normalized = value.trim().toLowerCase();
        return normalized === 'true' || normalized === '1' || normalized === 'yes';
    }
    return false;
};

const getPath = (obj, path) => path
    .split('.')
    .reduce((acc, key) => (acc == null ? undefined : acc[key]), obj);

const mergeObjects = (base, incoming) => {
    const output = { ...base };
    Object.keys(incoming || {}).forEach((key) => {
        const nextValue = incoming[key];
        if (
            nextValue
            && typeof nextValue === 'object'
            && !Array.isArray(nextValue)
            && base[key]
            && typeof base[key] === 'object'
            && !Array.isArray(base[key])
        ) {
            output[key] = mergeObjects(base[key], nextValue);
            return;
        }
        output[key] = nextValue;
    });
    return output;
};

const parseProfileInput = (profile) => {
    if (!profile) return null;
    if (typeof profile === 'object' && !Array.isArray(profile)) return profile;
    if (typeof profile !== 'string') return null;

    try {
        const parsed = JSON.parse(profile);
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
            return parsed;
        }
    } catch {
        return null;
    }

    return null;
};

const normalizeProfile = (profile) => {
    const parsedProfile = parseProfileInput(profile);
    if (!parsedProfile) {
        return JSON.parse(JSON.stringify(COMPLIANCE_PROFILE_DEFAULT));
    }

    return mergeObjects(JSON.parse(JSON.stringify(COMPLIANCE_PROFILE_DEFAULT)), parsedProfile);
};

const isArtifactValid = (artifact = {}, now = new Date()) => {
    if (artifact.verification_status !== COMPLIANCE_VERIFICATION_STATUS.VERIFIED) return false;
    if (artifact.status !== 'valid') return false;
    const validUntil = parseDate(artifact.valid_until);
    if (!validUntil) return true;
    return validUntil.getTime() >= now.getTime();
};

const isPeripheralAccredited = (device = {}, now = new Date()) => {
    if (device.verification_status !== COMPLIANCE_VERIFICATION_STATUS.VERIFIED) return false;
    if (device.status !== 'accredited') return false;
    const validUntil = parseDate(device.accreditation_valid_until);
    if (!validUntil) return true;
    return validUntil.getTime() >= now.getTime();
};

const normalizeTerminalId = (value) => {
    const normalized = String(value || '').trim();
    return normalized.length > 0 ? normalized : null;
};

const normalizeRequestedDocumentContext = (value) => {
    const normalized = String(value || '').trim().toLowerCase();
    if (Object.values(DOCUMENT_CONTEXTS).includes(normalized)) {
        return normalized;
    }
    return null;
};

const isPeripheralEligibleForTerminal = (device = {}, terminalId = null) => {
    const normalizedTerminalId = normalizeTerminalId(terminalId);
    if (!normalizedTerminalId) return true;
    if (device.is_shared === true) return true;
    return normalizeTerminalId(device.terminal_id) === normalizedTerminalId;
};

const checkProfileField = (profile, fieldPath, now = new Date()) => {
    const value = getPath(profile, fieldPath);
    if (BOOLEAN_PROFILE_FIELD_PATHS.has(fieldPath)) {
        return isTrueLike(value);
    }
    if (typeof value === 'number') return Number.isFinite(value);
    if (typeof value === 'string') {
        const normalizedValue = value.trim();
        if (normalizedValue.length === 0) return false;
        if (fieldPath.endsWith('_valid_until')) {
            if (/^\d{4}-\d{2}-\d{2}$/.test(normalizedValue)) {
                const todayToken = toLocalDateToken(now);
                return Boolean(todayToken) && normalizedValue >= todayToken;
            }
            const parsed = parseDate(normalizedValue);
            return Boolean(parsed) && parsed.getTime() >= now.getTime();
        }
        return true;
    }
    if (fieldPath.endsWith('_valid_until') && value instanceof Date) {
        const parsed = parseDate(value);
        return Boolean(parsed) && parsed.getTime() >= now.getTime();
    }
    return value != null;
};

const evaluateBspGate = ({ profile, now }) => {
    const opsRequired = isTrueLike(profile?.bsp?.ops_registration_required);
    if (!opsRequired) {
        return {
            allowed: true,
            reasonCode: COMPLIANCE_REASON_CODE.ALLOWED
        };
    }

    const opsStatus = String(profile?.bsp?.ops_registration_status || '').trim().toLowerCase();
    if (opsStatus !== 'active') {
        return {
            allowed: false,
            reasonCode: COMPLIANCE_REASON_CODE.BSP_OPS_REGISTRATION_REQUIRED
        };
    }

    const validUntil = parseDate(profile?.bsp?.ops_registration_valid_until);
    if (validUntil && validUntil.getTime() < now.getTime()) {
        return {
            allowed: false,
            reasonCode: COMPLIANCE_REASON_CODE.BSP_OPS_REGISTRATION_REQUIRED
        };
    }

    if (!isTrueLike(profile?.bsp?.payment_control_reviewed)) {
        return {
            allowed: false,
            reasonCode: COMPLIANCE_REASON_CODE.BSP_PAYMENT_CONTROL_REQUIRED
        };
    }

    return {
        allowed: true,
        reasonCode: COMPLIANCE_REASON_CODE.ALLOWED
    };
};

const PROFILE_FIELD_LABELS = Object.freeze({
    'bir.software_accreditation_number': 'BIR software accreditation number',
    'bir.software_accreditation_valid_until': 'BIR accreditation valid until',
    'bir.tax_classification_controls_confirmed': 'Tax classification controls confirmed',
    'bir.non_resettable_grand_total_enabled': 'Non-resettable grand total enabled',
    'bir.mandatory_receipt_fields_confirmed': 'Mandatory receipt fields confirmed',
    'bir.rmo_24_2023_filing_verified': 'RMO 24-2023 filing evidence verified',
    'bir.fiscal_document_content_reviewed': 'Fiscal document content reviewed',
    'bir.terminal_registration_controls_confirmed': 'Terminal registration controls confirmed',
    'bir.ejournal_integrity_controls_confirmed': 'E-journal integrity controls confirmed',
    'bir.esales_reporting_controls_confirmed': 'eSales reporting controls confirmed',
    'npc.dpo_name': 'Data protection officer name',
    'npc.dpo_email': 'Data protection officer email',
    'npc.dps_registration_number': 'NPC DPS registration number',
    'npc.dps_registration_valid_until': 'NPC DPS registration valid until',
    'npc.breach_notification_procedure_confirmed': 'Breach notification procedure confirmed',
    'bsp.ops_registration_status': 'OPS registration status',
    'bsp.payment_control_reviewed': 'Payment control reviewed',
    'readiness.tests_passed': 'Readiness tests passed'
});

const ARTIFACT_LABELS = Object.freeze({
    bir_accreditation_certificate: 'BIR accreditation certificate',
    bir_ptu_document: 'BIR PTU document',
    npc_dps_certificate: 'NPC DPS certificate',
    bsp_ops_certificate: 'BSP OPS certificate',
    ops_security_controls_attestation: 'OPS security controls attestation'
});

const DEVICE_CLASS_LABELS = Object.freeze({
    receipt_printer: 'Receipt printer',
    cash_drawer: 'Cash drawer',
    scanner: 'Scanner',
    payment_terminal: 'Payment terminal'
});

const SETTING_LABELS = Object.freeze({
    pos_business_name: 'Business name',
    pos_tin_branch: 'TIN branch',
    pos_address: 'Business address',
    pos_ptu_number: 'PTU number',
    pos_min_number: 'MIN number',
    pos_accreditation_number: 'Accreditation number'
});

const CONTROL_LABELS = Object.freeze({
    fiscal_accumulator_stream: 'Non-resettable fiscal accumulator stream',
    audit_log_append_only: 'Append-only compliance audit log enforcement',
    payment_handoff_policy: 'External payment handoff policy enforcement',
    encryption_policy_prerequisites: 'Encryption policy prerequisites',
    documentary_readiness: 'Submission documentary readiness',
    rmo_filing_readiness: 'RMO 24-2023 filing readiness',
    fiscal_terminal_registration: 'Verified fiscal terminal registration'
});

const asUniqueList = (values = []) => [...new Set(values)];

const buildRequirement = ({
    code,
    label,
    section,
    status,
    actionTarget
}) => ({
    code,
    label,
    section,
    status,
    action_target: actionTarget
});

const buildFinalReviewDocAnchor = (artifact = {}) => {
    const rawCode = String(artifact?.code || '').trim();
    if (!rawCode) return '/settings?tab=compliance#section-final-review';
    const slug = rawCode.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
    return `/settings?tab=compliance#final-review-doc-${slug}`;
};

const buildSectionProgress = (requirements = []) => {
    const sections = ['profile', 'settings', 'artifacts', 'peripherals', 'final_review'];
    const output = {};
    sections.forEach((section) => {
        const sectionRequirements = requirements.filter((entry) => entry.section === section);
        const total = sectionRequirements.length;
        const complete = sectionRequirements.filter((entry) => entry.status === 'complete').length;
        const missing = Math.max(0, total - complete);

        let status = 'complete';
        if (total > 0 && missing > 0) {
            status = complete === 0 ? 'not_started' : 'in_progress';
        }

        output[section] = {
            complete,
            total,
            missing,
            status
        };
    });
    return output;
};

export const evaluateComplianceChecklist = ({
    tenant,
    complianceProfile,
    artifacts = [],
    peripherals = [],
    settings = {},
    terminalId = null,
    policyPack,
    evidence = {},
    now = new Date()
}) => {
    const effectivePolicy = policyPack || getActivePolicyPack(now);
    const profile = normalizeProfile(complianceProfile || tenant?.compliance_profile);

    const missingProfileFields = [];
    const profileFieldPaths = [
        ...(effectivePolicy?.controls?.bir?.required_profile_fields || []),
        ...(effectivePolicy?.controls?.npc?.required_profile_fields || [])
    ];

    profileFieldPaths.forEach((fieldPath) => {
        if (!checkProfileField(profile, fieldPath, now)) {
            missingProfileFields.push(fieldPath);
        }
    });

    const opsRequired = isTrueLike(profile?.bsp?.ops_registration_required);
    if (opsRequired) {
        (effectivePolicy?.controls?.bsp?.required_profile_fields_when_ops_required || []).forEach((fieldPath) => {
            if (!checkProfileField(profile, fieldPath, now)) {
                missingProfileFields.push(fieldPath);
            }
        });
    }

    const readinessTestsPassed = isTrueLike(profile?.readiness?.tests_passed);
    if (!readinessTestsPassed) {
        missingProfileFields.push('readiness.tests_passed');
    }

    const fiscalAccumulatorStreamReady = evidence?.fiscal_accumulator_stream_ready !== false;
    const auditLogAppendOnlyEnforced = evidence?.audit_log_append_only_enforced !== false;
    const paymentHandoffPolicyReady = evidence?.payment_handoff_policy_ready !== false;
    const submissionArtifacts = Array.isArray(evidence?.submission_artifacts?.items)
        ? evidence.submission_artifacts.items
        : [];
    const submissionArtifactsReady = evidence?.submission_artifacts?.ready !== false;
    const encryptionPolicyPrerequisitesReady = evidence?.encryption_policy_prerequisites_ready !== false;
    const rmoFilingReadiness = evidence?.rmo_filing_readiness && typeof evidence.rmo_filing_readiness === 'object'
        ? evidence.rmo_filing_readiness
        : {};
    const rmoFilingReadinessReady = rmoFilingReadiness.ready === true;
    const fiscalTerminalRegistration = evidence?.fiscal_terminal_registration && typeof evidence.fiscal_terminal_registration === 'object'
        ? evidence.fiscal_terminal_registration
        : {};
    const fiscalTerminalRegistrationReady = fiscalTerminalRegistration.ready === true;

    const validArtifacts = new Set(
        (artifacts || [])
            .filter((artifact) => isArtifactValid(artifact, now))
            .map((artifact) => artifact.artifact_type)
    );

    const requiredArtifacts = [
        ...(effectivePolicy?.controls?.bir?.required_artifacts || []),
        ...(effectivePolicy?.controls?.npc?.required_artifacts || [])
    ];

    if (opsRequired) {
        requiredArtifacts.push(...(effectivePolicy?.controls?.bsp?.required_artifacts_when_ops_required || []));
    }

    const missingArtifacts = requiredArtifacts.filter((artifactType) => !validArtifacts.has(artifactType));

    const accreditedPeripherals = (peripherals || [])
        .filter((device) => isPeripheralAccredited(device, now))
        .filter((device) => isPeripheralEligibleForTerminal(device, terminalId));
    const requiredDeviceClasses = effectivePolicy?.controls?.peripherals?.required_classes_for_compliant_active || [];
    const missingPeripheralClasses = requiredDeviceClasses.filter((deviceClass) => (
        !accreditedPeripherals.some((device) => device.device_class === deviceClass)
    ));

    const missingSettingKeys = (effectivePolicy?.controls?.bir?.required_settings_keys || []).filter((key) => {
        const raw = settings?.[key]?.value;
        return raw == null || String(raw).trim().length === 0;
    });

    const allProfileFieldPaths = asUniqueList([
        ...profileFieldPaths,
        ...(opsRequired ? (effectivePolicy?.controls?.bsp?.required_profile_fields_when_ops_required || []) : []),
        'readiness.tests_passed'
    ]);
    const allRequiredArtifacts = asUniqueList(requiredArtifacts);
    const allRequiredDeviceClasses = asUniqueList(requiredDeviceClasses);
    const allRequiredSettings = asUniqueList(effectivePolicy?.controls?.bir?.required_settings_keys || []);

    const requirements = [
        ...allProfileFieldPaths.map((fieldPath) => buildRequirement({
            code: `profile.${fieldPath}`,
            label: PROFILE_FIELD_LABELS[fieldPath] || fieldPath,
            section: 'profile',
            status: missingProfileFields.includes(fieldPath) ? 'missing' : 'complete',
            actionTarget: '/settings?tab=compliance#section-profile'
        })),
        ...allRequiredSettings.map((settingKey) => buildRequirement({
            code: `setting.${settingKey}`,
            label: SETTING_LABELS[settingKey] || settingKey,
            section: 'settings',
            status: missingSettingKeys.includes(settingKey) ? 'missing' : 'complete',
            actionTarget: '/settings?tab=pos#receipt-contract-settings'
        })),
        ...allRequiredArtifacts.map((artifactType) => buildRequirement({
            code: `artifact.${artifactType}`,
            label: ARTIFACT_LABELS[artifactType] || artifactType,
            section: 'artifacts',
            status: missingArtifacts.includes(artifactType) ? 'missing' : 'complete',
            actionTarget: '/settings?tab=compliance#section-artifacts'
        })),
        ...allRequiredDeviceClasses.map((deviceClass) => buildRequirement({
            code: `peripheral.${deviceClass}`,
            label: DEVICE_CLASS_LABELS[deviceClass] || deviceClass,
            section: 'peripherals',
            status: missingPeripheralClasses.includes(deviceClass) ? 'missing' : 'complete',
            actionTarget: '/settings?tab=compliance#section-peripherals'
        })),
        buildRequirement({
            code: 'control.fiscal_accumulator_stream',
            label: CONTROL_LABELS.fiscal_accumulator_stream,
            section: 'profile',
            status: fiscalAccumulatorStreamReady ? 'complete' : 'missing',
            actionTarget: '/settings?tab=compliance#section-profile'
        }),
        buildRequirement({
            code: 'control.audit_log_append_only',
            label: CONTROL_LABELS.audit_log_append_only,
            section: 'profile',
            status: auditLogAppendOnlyEnforced ? 'complete' : 'missing',
            actionTarget: '/settings?tab=compliance#section-profile'
        }),
        buildRequirement({
            code: 'control.payment_handoff_policy',
            label: CONTROL_LABELS.payment_handoff_policy,
            section: 'settings',
            status: paymentHandoffPolicyReady ? 'complete' : 'missing',
            actionTarget: '/settings?tab=compliance#section-profile'
        }),
        buildRequirement({
            code: 'control.encryption_policy_prerequisites',
            label: CONTROL_LABELS.encryption_policy_prerequisites,
            section: 'final_review',
            status: encryptionPolicyPrerequisitesReady ? 'complete' : 'missing',
            actionTarget: '/settings?tab=compliance#section-final-review'
        }),
        buildRequirement({
            code: 'control.documentary_readiness',
            label: CONTROL_LABELS.documentary_readiness,
            section: 'final_review',
            status: submissionArtifactsReady ? 'complete' : 'missing',
            actionTarget: '/settings?tab=compliance#section-final-review'
        }),
        buildRequirement({
            code: 'control.rmo_filing_readiness',
            label: CONTROL_LABELS.rmo_filing_readiness,
            section: 'final_review',
            status: rmoFilingReadinessReady ? 'complete' : 'missing',
            actionTarget: '/settings?tab=compliance#section-rmo-filing-readiness'
        }),
        buildRequirement({
            code: 'control.fiscal_terminal_registration',
            label: CONTROL_LABELS.fiscal_terminal_registration,
            section: 'settings',
            status: fiscalTerminalRegistrationReady ? 'complete' : 'missing',
            actionTarget: fiscalTerminalRegistration.action_target || '/settings?tab=pos#fiscal-terminal-registration'
        }),
        ...submissionArtifacts.map((artifact) => buildRequirement({
            code: artifact?.code || `submission.${String(artifact?.relative_path || 'artifact').replace(/[^\w.-]+/g, '_')}`,
            label: artifact?.label || artifact?.relative_path || 'Submission artifact',
            section: 'final_review',
            status: artifact?.ready === true ? 'complete' : 'missing',
            actionTarget: buildFinalReviewDocAnchor(artifact)
        }))
    ];

    const activationBlockers = [];
    if (missingProfileFields.length > 0) {
        activationBlockers.push({
            code: COMPLIANCE_REASON_CODE.COMPLIANCE_PROFILE_INCOMPLETE,
            section: 'profile',
            message: 'Complete required compliance profile and readiness fields.',
            action_target: '/settings?tab=compliance#section-profile'
        });
    }
    if (missingSettingKeys.length > 0) {
        activationBlockers.push({
            code: COMPLIANCE_REASON_CODE.COMPLIANCE_SETTINGS_INCOMPLETE,
            section: 'settings',
            message: 'Complete required POS setup settings used by fiscal documents.',
            action_target: '/settings?tab=pos#receipt-contract-settings'
        });
    }
    if (missingArtifacts.length > 0) {
        activationBlockers.push({
            code: COMPLIANCE_REASON_CODE.COMPLIANCE_ARTIFACTS_INCOMPLETE,
            section: 'artifacts',
            message: 'Provide and verify all required compliance artifacts.',
            action_target: '/settings?tab=compliance#section-artifacts'
        });
    }
    if (missingPeripheralClasses.length > 0) {
        activationBlockers.push({
            code: COMPLIANCE_REASON_CODE.ACCREDITED_PERIPHERAL_REQUIRED,
            section: 'peripherals',
            message: 'Provide and verify accredited required peripherals for activation.',
            action_target: '/settings?tab=compliance#section-peripherals'
        });
    }
    if (!readinessTestsPassed) {
        activationBlockers.push({
            code: COMPLIANCE_REASON_CODE.READINESS_TESTS_REQUIRED,
            section: 'profile',
            message: 'Readiness tests must be passed before activation.',
            action_target: '/settings?tab=compliance#section-profile'
        });
    }
    if (!fiscalAccumulatorStreamReady) {
        activationBlockers.push({
            code: COMPLIANCE_REASON_CODE.COMPLIANT_MODE_FAIL_CLOSED,
            section: 'profile',
            message: 'Fiscal accumulator evidence is unavailable. Run POS fiscal checks before activation.',
            action_target: '/settings?tab=compliance#section-profile'
        });
    }
    if (!auditLogAppendOnlyEnforced) {
        activationBlockers.push({
            code: COMPLIANCE_REASON_CODE.VERIFICATION_REQUIRED,
            section: 'profile',
            message: 'Compliance audit append-only enforcement is missing. Activation is blocked until audit immutability checks pass.',
            action_target: '/settings?tab=compliance#section-profile'
        });
    }
    if (!paymentHandoffPolicyReady) {
        activationBlockers.push({
            code: COMPLIANCE_REASON_CODE.BSP_PAYMENT_CONTROL_REQUIRED,
            section: 'settings',
            message: 'Payment handoff policy controls are incomplete. Confirm OPS/payment control requirements before activation.',
            action_target: '/settings?tab=compliance#section-profile'
        });
    }
    if (!encryptionPolicyPrerequisitesReady) {
        activationBlockers.push({
            code: COMPLIANCE_REASON_CODE.COMPLIANT_MODE_FAIL_CLOSED,
            section: 'final_review',
            message: 'Encryption policy prerequisites are incomplete. Complete transport and at-rest encryption requirements before activation.',
            action_target: '/settings?tab=compliance#section-final-review'
        });
    }
    if (!submissionArtifactsReady) {
        const firstMissingSubmissionArtifact = submissionArtifacts.find((artifact) => artifact?.ready !== true) || null;
        activationBlockers.push({
            code: COMPLIANCE_REASON_CODE.VERIFICATION_REQUIRED,
            section: 'final_review',
            message: 'Submission documentary evidence is incomplete or stale. Update required filing artifacts before activation.',
            action_target: firstMissingSubmissionArtifact
                ? buildFinalReviewDocAnchor(firstMissingSubmissionArtifact)
                : '/settings?tab=compliance#section-final-review'
        });
    }
    if (!rmoFilingReadinessReady) {
        const firstMissingRmoItem = Array.isArray(rmoFilingReadiness.items)
            ? rmoFilingReadiness.items.find((item) => item?.ready !== true)
            : null;
        activationBlockers.push({
            code: COMPLIANCE_REASON_CODE.RMO_FILING_EVIDENCE_REQUIRED,
            section: 'final_review',
            message: 'RMO 24-2023 filing evidence is incomplete or not verified. Complete RMO filing readiness before fiscal activation.',
            action_target: firstMissingRmoItem?.action_target || '/settings?tab=compliance#section-rmo-filing-readiness'
        });
    }
    if (!fiscalTerminalRegistrationReady) {
        activationBlockers.push({
            code: COMPLIANCE_REASON_CODE.FISCAL_TERMINAL_REGISTRATION_REQUIRED,
            section: 'settings',
            message: 'At least one fiscal terminal must be verified before compliant fiscal activation.',
            action_target: fiscalTerminalRegistration.action_target || '/settings?tab=pos#fiscal-terminal-registration'
        });
    }

    const sectionProgress = buildSectionProgress(requirements);
    const nextBlockingStep = activationBlockers[0]?.section || null;

    return {
        policy_version: effectivePolicy.version,
        profile,
        profile_complete: missingProfileFields.length === 0,
        missing_profile_fields: missingProfileFields,
        artifacts_complete: missingArtifacts.length === 0,
        missing_artifacts: missingArtifacts,
        terminal_id: normalizeTerminalId(terminalId),
        peripherals_complete: missingPeripheralClasses.length === 0,
        missing_peripheral_classes: missingPeripheralClasses,
        settings_complete: missingSettingKeys.length === 0,
        missing_setting_keys: missingSettingKeys,
        readiness_tests_passed: readinessTestsPassed,
        requirements,
        section_progress: sectionProgress,
        activation_blockers: activationBlockers,
        next_blocking_step: nextBlockingStep,
        documentary_readiness: {
            complete: Number.parseInt(evidence?.submission_artifacts?.complete || 0, 10) || 0,
            total: Number.parseInt(evidence?.submission_artifacts?.total || 0, 10) || 0,
            missing: Number.parseInt(evidence?.submission_artifacts?.missing || 0, 10) || 0,
            ready: submissionArtifactsReady,
            items: submissionArtifacts
        },
        evidence: {
            fiscal_accumulator_stream_ready: fiscalAccumulatorStreamReady,
            audit_log_append_only_enforced: auditLogAppendOnlyEnforced,
            payment_handoff_policy_ready: paymentHandoffPolicyReady,
            encryption_policy_prerequisites_ready: encryptionPolicyPrerequisitesReady,
            encryption_policy_checks: evidence?.encryption_policy_checks && typeof evidence.encryption_policy_checks === 'object'
                ? evidence.encryption_policy_checks
                : {},
            encryption_policy_issues: Array.isArray(evidence?.encryption_policy_issues)
                ? evidence.encryption_policy_issues
                : [],
            fiscal_lifetime_grand_total_cents: Number.parseInt(evidence?.fiscal_lifetime_grand_total_cents || 0, 10) || 0,
            audit_append_only_trigger_names: Array.isArray(evidence?.audit_append_only_trigger_names)
                ? evidence.audit_append_only_trigger_names
                : [],
            submission_artifacts: {
                ready: submissionArtifactsReady,
                complete: Number.parseInt(evidence?.submission_artifacts?.complete || 0, 10) || 0,
                total: Number.parseInt(evidence?.submission_artifacts?.total || 0, 10) || 0,
                missing: Number.parseInt(evidence?.submission_artifacts?.missing || 0, 10) || 0,
                items: submissionArtifacts
            },
            rmo_filing_readiness: {
                ready: rmoFilingReadinessReady,
                complete: Number.parseInt(rmoFilingReadiness?.complete || 0, 10) || 0,
                total: Number.parseInt(rmoFilingReadiness?.total || 0, 10) || 0,
                missing: Number.parseInt(rmoFilingReadiness?.missing || 0, 10) || 0,
                items: Array.isArray(rmoFilingReadiness?.items) ? rmoFilingReadiness.items : []
            },
            fiscal_terminal_registration: {
                ready: fiscalTerminalRegistrationReady,
                verified_count: Number.parseInt(fiscalTerminalRegistration?.verified_count || 0, 10) || 0,
                total_count: Number.parseInt(fiscalTerminalRegistration?.total_count || 0, 10) || 0,
                action_target: fiscalTerminalRegistration.action_target || '/settings?tab=pos#fiscal-terminal-registration'
            }
        },
        ready_for_compliant_activation: (
            missingProfileFields.length === 0
            && missingArtifacts.length === 0
            && missingPeripheralClasses.length === 0
            && missingSettingKeys.length === 0
            && readinessTestsPassed
            && fiscalAccumulatorStreamReady
            && auditLogAppendOnlyEnforced
            && paymentHandoffPolicyReady
            && encryptionPolicyPrerequisitesReady
            && submissionArtifactsReady
            && rmoFilingReadinessReady
            && fiscalTerminalRegistrationReady
        )
    };
};

const resolveReceiptContract = ({ modeState }) => {
    if (modeState === COMPLIANCE_MODE_STATE.COMPLIANT_ACTIVE) {
        return {
            document_type: 'fiscal_invoice',
            label: 'FISCAL INVOICE',
            document_context: DOCUMENT_CONTEXTS.FISCAL
        };
    }

    return {
        document_type: 'non_fiscal_slip',
        label: 'NON-FISCAL SLIP',
        document_context: DOCUMENT_CONTEXTS.NON_FISCAL
    };
};

const buildDecision = ({
    tenant,
    operation,
    modeState,
    decision,
    reasonCode,
    checklist,
    policyPack,
    obligations = []
}) => ({
    operation,
    tenant_id: tenant?.id || null,
    mode_state: modeState || null,
    decision,
    reason_code: reasonCode,
    policy_version: policyPack.version,
    receipt_contract: resolveReceiptContract({ modeState }),
    checklist: checklist || null,
    obligations
});

export const evaluateComplianceDecision = ({
    tenant,
    operation,
    context = {},
    artifacts = [],
    peripherals = [],
    settings = {},
    evidence = {},
    now = new Date()
}) => {
    const policyPack = getActivePolicyPack(now);
    const rawModeState = tenant?.compliance_mode_state || null;
    const modeState = rawModeState || COMPLIANCE_MODE_STATE.NON_COMPLIANT_ACTIVE;
    const choiceRequired = tenant?.compliance_mode_choice_required === true;

    if (choiceRequired && (POS_OPERATIONS.has(operation) || operation === COMPLIANCE_OPERATION.PAYMENT_CAPABILITY_ENABLE)) {
        return buildDecision({
            tenant,
            operation,
            modeState,
            decision: COMPLIANCE_DECISION.REQUIRES_SETUP,
            reasonCode: COMPLIANCE_REASON_CODE.LEGACY_MODE_SELECTION_REQUIRED,
            policyPack,
            obligations: ['Select compliance mode before proceeding.']
        });
    }

    const profile = normalizeProfile(tenant?.compliance_profile);
    const requestedDocumentContext = normalizeRequestedDocumentContext(context.requested_document_context);
    const requestedPaymentType = String(context.payment_type || '').trim().toLowerCase();
    const requestedPaymentHandoffMode = String(context.payment_handoff_mode || '').trim().toLowerCase();
    const isNonCashPayment = requestedPaymentType.length > 0 && requestedPaymentType !== 'cash';
    const resolvedPaymentHandoffMode = requestedPaymentHandoffMode || (isNonCashPayment ? 'external' : 'internal');

    if (
        operation === COMPLIANCE_OPERATION.POS_CHECKOUT
        && isNonCashPayment
        && resolvedPaymentHandoffMode !== 'external'
    ) {
        const bspGate = evaluateBspGate({ profile, now });
        if (!bspGate.allowed) {
            return buildDecision({
                tenant,
                operation,
                modeState,
                decision: COMPLIANCE_DECISION.DENY,
                reasonCode: bspGate.reasonCode,
                policyPack,
                obligations: [
                    'OPS controls are incomplete. Use external handoff mode for non-cash payments until BSP controls are satisfied.'
                ]
            });
        }
    }

    if (operation === COMPLIANCE_OPERATION.PAYMENT_CAPABILITY_ENABLE) {
        const bspGate = evaluateBspGate({ profile, now });
        if (!bspGate.allowed) {
            return buildDecision({
                tenant,
                operation,
                modeState,
                decision: COMPLIANCE_DECISION.DENY,
                reasonCode: bspGate.reasonCode,
                policyPack,
                obligations: ['Update BSP OPS controls in compliance profile.']
            });
        }

        return buildDecision({
            tenant,
            operation,
            modeState,
            decision: COMPLIANCE_DECISION.ALLOW,
            reasonCode: COMPLIANCE_REASON_CODE.ALLOWED,
            policyPack
        });
    }

    if (modeState === COMPLIANCE_MODE_STATE.NON_COMPLIANT_ACTIVE) {
        if (
            operation === COMPLIANCE_OPERATION.RECEIPT_RENDER
            && (context.requested_document_type === 'fiscal_invoice' || requestedDocumentContext === DOCUMENT_CONTEXTS.FISCAL)
        ) {
            return buildDecision({
                tenant,
                operation,
                modeState,
                decision: COMPLIANCE_DECISION.DENY,
                reasonCode: COMPLIANCE_REASON_CODE.NON_COMPLIANT_FISCAL_DOCUMENT_BLOCKED,
                policyPack,
                obligations: ['Switch to compliant mode to use fiscal invoice documents.']
            });
        }

        if (
            operation === COMPLIANCE_OPERATION.POS_CHECKOUT
            && requestedDocumentContext === DOCUMENT_CONTEXTS.FISCAL
        ) {
            return buildDecision({
                tenant,
                operation,
                modeState,
                decision: COMPLIANCE_DECISION.DENY,
                reasonCode: COMPLIANCE_REASON_CODE.NON_COMPLIANT_FISCAL_DOCUMENT_BLOCKED,
                policyPack,
                obligations: ['Non-compliant mode supports non-fiscal or training/test document context only.']
            });
        }

        if (operation === COMPLIANCE_OPERATION.SETTINGS_UPDATE) {
            const settingKeys = new Set(context.setting_keys || []);
            const blocksFiscalKey = Array.from(settingKeys).some((key) => FISCAL_ONLY_SETTING_KEYS.has(key));
            if (blocksFiscalKey) {
                return buildDecision({
                    tenant,
                    operation,
                    modeState,
                    decision: COMPLIANCE_DECISION.DENY,
                    reasonCode: COMPLIANCE_REASON_CODE.NON_COMPLIANT_FISCAL_FIELDS_BLOCKED,
                    policyPack,
                    obligations: ['Upgrade to compliant mode pending before editing fiscal settings.']
                });
            }
        }

        return buildDecision({
            tenant,
            operation,
            modeState,
            decision: COMPLIANCE_DECISION.ALLOW,
            reasonCode: COMPLIANCE_REASON_CODE.ALLOWED,
            policyPack
        });
    }

    if (modeState === COMPLIANCE_MODE_STATE.COMPLIANT_PENDING) {
        if (
            operation === COMPLIANCE_OPERATION.RECEIPT_RENDER
            && (context.requested_document_type === 'fiscal_invoice' || requestedDocumentContext === DOCUMENT_CONTEXTS.FISCAL)
        ) {
            return buildDecision({
                tenant,
                operation,
                modeState,
                decision: COMPLIANCE_DECISION.REQUIRES_SETUP,
                reasonCode: COMPLIANCE_REASON_CODE.COMPLIANT_ACTIVATION_PENDING,
                policyPack,
                obligations: ['Complete compliance activation checklist to issue fiscal documents.']
            });
        }

        if (
            operation === COMPLIANCE_OPERATION.POS_CHECKOUT
            && requestedDocumentContext === DOCUMENT_CONTEXTS.FISCAL
        ) {
            return buildDecision({
                tenant,
                operation,
                modeState,
                decision: COMPLIANCE_DECISION.REQUIRES_SETUP,
                reasonCode: COMPLIANCE_REASON_CODE.COMPLIANT_ACTIVATION_PENDING,
                policyPack,
                obligations: ['Compliant-pending mode cannot issue fiscal-context documents yet.']
            });
        }

        return buildDecision({
            tenant,
            operation,
            modeState,
            decision: COMPLIANCE_DECISION.ALLOW,
            reasonCode: COMPLIANCE_REASON_CODE.ALLOWED,
            policyPack,
            obligations: ['Complete activation checklist to switch from non-fiscal to fiscal output.']
        });
    }

    if (modeState === COMPLIANCE_MODE_STATE.COMPLIANT_ACTIVE) {
        if (
            POS_OPERATIONS.has(operation)
            && requestedDocumentContext
            && requestedDocumentContext !== DOCUMENT_CONTEXTS.FISCAL
        ) {
            return buildDecision({
                tenant,
                operation,
                modeState,
                decision: COMPLIANCE_DECISION.DENY,
                reasonCode: COMPLIANCE_REASON_CODE.DOCUMENT_CONTEXT_NOT_ALLOWED,
                policyPack,
                obligations: ['Compliant-active mode enforces fiscal document context for POS and receipt operations.']
            });
        }

        if (operation === COMPLIANCE_OPERATION.SETTINGS_UPDATE) {
            return buildDecision({
                tenant,
                operation,
                modeState,
                decision: COMPLIANCE_DECISION.ALLOW,
                reasonCode: COMPLIANCE_REASON_CODE.ALLOWED,
                policyPack
            });
        }

        if (POS_OPERATIONS.has(operation)) {
            const checklist = evaluateComplianceChecklist({
                tenant,
                complianceProfile: profile,
                artifacts,
                peripherals,
                settings,
                terminalId: context.terminal_id || null,
                policyPack,
                evidence,
                now
            });

            if (!checklist.profile_complete || !checklist.settings_complete) {
                return buildDecision({
                    tenant,
                    operation,
                    modeState,
                    decision: COMPLIANCE_DECISION.REQUIRES_SETUP,
                    reasonCode: COMPLIANCE_REASON_CODE.COMPLIANCE_PROFILE_INCOMPLETE,
                    checklist,
                    policyPack,
                    obligations: ['Complete required BIR/NPC profile and settings fields.']
                });
            }

            if (!checklist.artifacts_complete) {
                return buildDecision({
                    tenant,
                    operation,
                    modeState,
                    decision: COMPLIANCE_DECISION.REQUIRES_SETUP,
                    reasonCode: COMPLIANCE_REASON_CODE.COMPLIANCE_ARTIFACTS_INCOMPLETE,
                    checklist,
                    policyPack,
                    obligations: ['Upload and validate required compliance artifacts.']
                });
            }

            if (!checklist.peripherals_complete) {
                return buildDecision({
                    tenant,
                    operation,
                    modeState,
                    decision: COMPLIANCE_DECISION.DENY,
                    reasonCode: checklist.terminal_id
                        ? COMPLIANCE_REASON_CODE.TERMINAL_DEVICE_MISMATCH
                        : COMPLIANCE_REASON_CODE.ACCREDITED_PERIPHERAL_REQUIRED,
                    checklist,
                    policyPack,
                    obligations: checklist.terminal_id
                        ? ['Assign terminal-specific accredited peripherals or configure explicit shared accredited devices.']
                        : ['Register accredited peripherals for all required device classes.']
                });
            }

            return buildDecision({
                tenant,
                operation,
                modeState,
                decision: COMPLIANCE_DECISION.ALLOW,
                reasonCode: COMPLIANCE_REASON_CODE.ALLOWED,
                checklist,
                policyPack
            });
        }

        return buildDecision({
            tenant,
            operation,
            modeState,
            decision: COMPLIANCE_DECISION.ALLOW,
            reasonCode: COMPLIANCE_REASON_CODE.ALLOWED,
            policyPack
        });
    }

    return buildDecision({
        tenant,
        operation,
        modeState,
        decision: COMPLIANCE_DECISION.REQUIRES_SETUP,
        reasonCode: COMPLIANCE_REASON_CODE.LEGACY_MODE_SELECTION_REQUIRED,
        policyPack
    });
};

export const buildPreflightResult = ({ decisions = [], impactDeclarationPresent = false }) => {
    const blockingDecision = decisions.find((decision) => decision.decision !== COMPLIANCE_DECISION.ALLOW);

    if (!impactDeclarationPresent) {
        return {
            result: 'breach',
            can_proceed: false,
            reason_code: COMPLIANCE_REASON_CODE.IMPACT_DECLARATION_REQUIRED,
            decisions,
            required_actions: ['Submit compliance impact declaration before implementation.']
        };
    }

    if (!blockingDecision) {
        return {
            result: 'no_breach',
            can_proceed: true,
            reason_code: COMPLIANCE_REASON_CODE.ALLOWED,
            decisions,
            required_actions: []
        };
    }

    return {
        result: blockingDecision.decision === COMPLIANCE_DECISION.REQUIRES_SETUP ? 'review_required' : 'breach',
        can_proceed: false,
        reason_code: blockingDecision.reason_code,
        decisions,
        required_actions: blockingDecision.obligations || []
    };
};
