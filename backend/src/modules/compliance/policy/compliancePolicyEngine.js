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

const parseDate = (value) => {
    if (!value) return null;
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
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

const normalizeProfile = (profile) => {
    if (!profile || typeof profile !== 'object' || Array.isArray(profile)) {
        return JSON.parse(JSON.stringify(COMPLIANCE_PROFILE_DEFAULT));
    }

    return mergeObjects(JSON.parse(JSON.stringify(COMPLIANCE_PROFILE_DEFAULT)), profile);
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

const isPeripheralEligibleForTerminal = (device = {}, terminalId = null) => {
    const normalizedTerminalId = normalizeTerminalId(terminalId);
    if (!normalizedTerminalId) return true;
    if (device.is_shared === true) return true;
    return normalizeTerminalId(device.terminal_id) === normalizedTerminalId;
};

const checkProfileField = (profile, fieldPath) => {
    const value = getPath(profile, fieldPath);
    if (typeof value === 'boolean') return value;
    if (typeof value === 'number') return Number.isFinite(value);
    if (typeof value === 'string') {
        if (fieldPath.endsWith('_valid_until')) {
            const parsed = parseDate(value);
            return Boolean(parsed);
        }
        return value.trim().length > 0;
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

export const evaluateComplianceChecklist = ({
    tenant,
    complianceProfile,
    artifacts = [],
    peripherals = [],
    settings = {},
    terminalId = null,
    policyPack,
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
        if (!checkProfileField(profile, fieldPath)) {
            missingProfileFields.push(fieldPath);
        }
    });

    const opsRequired = isTrueLike(profile?.bsp?.ops_registration_required);
    if (opsRequired) {
        (effectivePolicy?.controls?.bsp?.required_profile_fields_when_ops_required || []).forEach((fieldPath) => {
            if (!checkProfileField(profile, fieldPath)) {
                missingProfileFields.push(fieldPath);
            }
        });
    }

    const readinessTestsPassed = isTrueLike(profile?.readiness?.tests_passed);
    if (!readinessTestsPassed) {
        missingProfileFields.push('readiness.tests_passed');
    }

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
        ready_for_compliant_activation: (
            missingProfileFields.length === 0
            && missingArtifacts.length === 0
            && missingPeripheralClasses.length === 0
            && missingSettingKeys.length === 0
            && readinessTestsPassed
        )
    };
};

const resolveReceiptContract = ({ modeState }) => {
    if (modeState === COMPLIANCE_MODE_STATE.COMPLIANT_ACTIVE) {
        return {
            document_type: 'fiscal_invoice',
            label: 'FISCAL INVOICE'
        };
    }

    return {
        document_type: 'non_fiscal_slip',
        label: 'NON-FISCAL SLIP'
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
        if (operation === COMPLIANCE_OPERATION.RECEIPT_RENDER && context.requested_document_type === 'fiscal_invoice') {
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
        if (operation === COMPLIANCE_OPERATION.RECEIPT_RENDER && context.requested_document_type === 'fiscal_invoice') {
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
