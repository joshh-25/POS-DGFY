
import { ok, fail } from '../../shared/contracts/applicationResult.js';
import { DomainError, DomainErrorCode } from '../../shared/contracts/domainErrors.js';
import {
    COMPLIANCE_OPERATION,
    COMPLIANCE_DECISION,
    COMPLIANCE_REASON_CODE,
    COMPLIANCE_MODE_STATE,
    COMPLIANCE_MODE_CHOICES,
    COMPLIANCE_VERIFICATION_STATUS,
    COMPLIANCE_VERIFIER_ACTOR_TYPE
} from '../policy/complianceConstants.js';
import {
    evaluateComplianceChecklist,
    evaluateComplianceDecision,
    buildPreflightResult
} from '../policy/compliancePolicyEngine.js';

const parsePositiveInt = (value) => {
    const parsed = Number.parseInt(value, 10);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
};

const ACTIVATION_CONFIRMATION_TEXT = 'ACTIVATE COMPLIANT';
const SECURITY_INCIDENT_STATUS = Object.freeze({
    NEW: 'new',
    ACKNOWLEDGED: 'acknowledged',
    RESOLVED: 'resolved'
});
const SECURITY_SIGNAL_EVENT_TYPE = 'security_signal';
const FINAL_REVIEW_DOCUMENT_REQUIREMENTS = Object.freeze({
    submission_system_flow_diagram_mmd: {
        code: 'submission.system_flow_diagram',
        label: 'System flow diagram (Mermaid source)',
        requiresFreshness: false
    },
    submission_system_flow_diagram_png: {
        code: 'submission.system_flow_diagram_image',
        label: 'System flow diagram (exported image)',
        requiresFreshness: false
    },
    submission_software_specification: {
        code: 'submission.software_specification',
        label: 'Software specification packet',
        requiresFreshness: false
    },
    submission_backup_dr_plan: {
        code: 'submission.backup_disaster_recovery_plan',
        label: 'Data backup and disaster recovery plan',
        requiresFreshness: false
    },
    submission_filing_instructions: {
        code: 'submission.filing_instructions',
        label: 'Filing instructions',
        requiresFreshness: false
    },
    evidence_restore_drill: {
        code: 'submission.restore_drill_evidence',
        label: 'Latest restore drill evidence',
        requiresFreshness: true
    },
    evidence_encryption_verification: {
        code: 'submission.encryption_verification_evidence',
        label: 'Latest encryption verification evidence',
        requiresFreshness: true
    }
});

const normalizeComplianceProfileValue = (value) => {
    if (!value) return {};
    if (typeof value === 'object' && !Array.isArray(value)) return value;
    if (typeof value !== 'string') return {};

    try {
        const parsed = JSON.parse(value);
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
            return parsed;
        }
    } catch {
        return {};
    }

    return {};
};

const parseDate = (value) => {
    if (!value) return null;
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const normalizeDateValue = (value) => {
    const parsed = parseDate(value);
    return parsed ? parsed.toISOString() : null;
};

const getFinalReviewRequirement = (requirementCode) => {
    const normalized = String(requirementCode || '').trim();
    if (!normalized) return null;
    return FINAL_REVIEW_DOCUMENT_REQUIREMENTS[normalized] || null;
};

const isTrueLike = (value) => {
    if (value === true || value === 1) return true;
    if (typeof value === 'string') {
        const normalized = value.trim().toLowerCase();
        return normalized === 'true' || normalized === '1' || normalized === 'yes';
    }
    return false;
};

const resolvePaymentHandoffPolicyReady = (profile = {}, now = new Date()) => {
    const opsRequired = isTrueLike(profile?.bsp?.ops_registration_required);
    if (!opsRequired) return true;

    const opsStatus = String(profile?.bsp?.ops_registration_status || '').trim().toLowerCase();
    if (opsStatus !== 'active') return false;

    const validUntil = parseDate(profile?.bsp?.ops_registration_valid_until);
    if (validUntil && validUntil.getTime() < now.getTime()) return false;

    return isTrueLike(profile?.bsp?.payment_control_reviewed);
};

const resolveChecklistEvidence = async ({ complianceRepository, tenantId = null, profile = {} }) => {
    const [fiscalState, appendOnlyState, submissionReadiness, encryptionPolicyState] = await Promise.all([
        typeof complianceRepository?.getFiscalAccumulatorState === 'function'
            ? complianceRepository.getFiscalAccumulatorState()
            : Promise.resolve({ ready: true, lifetime_grand_total_cents: 0 }),
        typeof complianceRepository?.getComplianceAuditAppendOnlyState === 'function'
            ? complianceRepository.getComplianceAuditAppendOnlyState()
            : Promise.resolve({ ready: true, trigger_names: [] }),
        typeof complianceRepository?.getSubmissionArtifactReadiness === 'function'
            ? complianceRepository.getSubmissionArtifactReadiness(tenantId)
            : Promise.resolve({ ready: true, complete: 0, total: 0, missing: 0, items: [] }),
        typeof complianceRepository?.getEncryptionPolicyPrerequisitesState === 'function'
            ? complianceRepository.getEncryptionPolicyPrerequisitesState()
            : Promise.resolve({ ready: true, checks: {}, issues: [] })
    ]);

    return {
        fiscal_accumulator_stream_ready: fiscalState?.ready !== false,
        fiscal_lifetime_grand_total_cents: Number.parseInt(fiscalState?.lifetime_grand_total_cents || 0, 10) || 0,
        audit_log_append_only_enforced: appendOnlyState?.ready !== false,
        audit_append_only_trigger_names: Array.isArray(appendOnlyState?.trigger_names)
            ? appendOnlyState.trigger_names
            : [],
        payment_handoff_policy_ready: resolvePaymentHandoffPolicyReady(profile),
        encryption_policy_prerequisites_ready: encryptionPolicyState?.ready !== false,
        encryption_policy_checks: encryptionPolicyState?.checks && typeof encryptionPolicyState.checks === 'object'
            ? encryptionPolicyState.checks
            : {},
        encryption_policy_issues: Array.isArray(encryptionPolicyState?.issues)
            ? encryptionPolicyState.issues
            : [],
        submission_artifacts: {
            ready: submissionReadiness?.ready === true,
            complete: Number.parseInt(submissionReadiness?.complete || 0, 10) || 0,
            total: Number.parseInt(submissionReadiness?.total || 0, 10) || 0,
            missing: Number.parseInt(submissionReadiness?.missing || 0, 10) || 0,
            items: Array.isArray(submissionReadiness?.items) ? submissionReadiness.items : []
        }
    };
};

const normalizeSecurityIncidentStatus = (value) => {
    const normalized = String(value || '').trim().toLowerCase();
    if (normalized === SECURITY_INCIDENT_STATUS.ACKNOWLEDGED) return SECURITY_INCIDENT_STATUS.ACKNOWLEDGED;
    if (normalized === SECURITY_INCIDENT_STATUS.RESOLVED) return SECURITY_INCIDENT_STATUS.RESOLVED;
    return SECURITY_INCIDENT_STATUS.NEW;
};

const normalizeSecuritySeverity = (value) => {
    const normalized = String(value || '').trim().toLowerCase();
    return ['info', 'warning', 'critical'].includes(normalized) ? normalized : 'warning';
};

const normalizeIncidentDispatchChannel = (value) => {
    const normalized = String(value || '').trim().toLowerCase();
    if (['email', 'webhook', 'audit_only'].includes(normalized)) return normalized;
    return 'audit_only';
};

const normalizeIncidentDeliveryStatus = (value) => {
    const normalized = String(value || '').trim().toLowerCase();
    if (['sent', 'queued', 'failed', 'skipped', 'recorded'].includes(normalized)) return normalized;
    return 'recorded';
};

const normalizeBooleanEnv = (value, fallback = false) => {
    if (value == null || value === '') return fallback;
    const normalized = String(value).trim().toLowerCase();
    if (['true', '1', 'yes', 'on'].includes(normalized)) return true;
    if (['false', '0', 'no', 'off'].includes(normalized)) return false;
    return fallback;
};

const resolveIncidentDispatchTarget = (channel) => {
    if (channel === 'email') {
        return String(process.env.COMPLIANCE_INCIDENT_EMAIL_TO || '').trim();
    }
    if (channel === 'webhook') {
        return String(process.env.COMPLIANCE_INCIDENT_WEBHOOK_URL || '').trim();
    }
    return '';
};

const resolveIncidentDispatchOutcome = ({ channel }) => {
    if (channel === 'audit_only') {
        return {
            delivery_status: 'recorded',
            error: null,
            target_configured: true,
            dispatch_reference: null
        };
    }

    const strictMode = normalizeBooleanEnv(process.env.COMPLIANCE_INCIDENT_NOTIFY_STRICT, false);
    const simulateMode = String(process.env.COMPLIANCE_INCIDENT_NOTIFY_SIMULATE || '').trim().toLowerCase();
    const target = resolveIncidentDispatchTarget(channel);
    const hasTarget = target.length > 0;

    if (!hasTarget && strictMode) {
        return {
            delivery_status: 'failed',
            error: `${channel}_target_missing`,
            target_configured: false,
            dispatch_reference: null
        };
    }

    if (simulateMode === 'fail') {
        return {
            delivery_status: 'failed',
            error: `${channel}_dispatch_failed`,
            target_configured: hasTarget,
            dispatch_reference: null
        };
    }

    if (simulateMode === 'sent') {
        return {
            delivery_status: 'sent',
            error: null,
            target_configured: hasTarget,
            dispatch_reference: hasTarget ? `${channel}:${target}` : null
        };
    }

    return {
        delivery_status: hasTarget ? 'queued' : 'recorded',
        error: null,
        target_configured: hasTarget,
        dispatch_reference: hasTarget ? `${channel}:${target}` : null
    };
};

const buildSecurityIncidentId = ({ signalCode, createdAt }) => (
    `sig-${String(signalCode || 'unknown').replace(/[^a-z0-9_-]/gi, '-').toLowerCase()}-${String(createdAt || Date.now()).replace(/[^0-9]/g, '').slice(-14)}`
);

const isSecuritySignalAuditLog = (entry = {}) => {
    const eventType = String(entry?.event_type || '').trim().toLowerCase();
    if (eventType === SECURITY_SIGNAL_EVENT_TYPE) return true;
    const operation = String(entry?.operation || '').trim().toLowerCase();
    return operation.startsWith('security.');
};

const deriveSignalCode = ({ operation = '', reasonCode = '', metadata = {} }) => {
    const metadataSignalCode = String(metadata?.signal_code || '').trim().toLowerCase();
    if (metadataSignalCode) return metadataSignalCode;

    const fromOperation = String(operation || '').trim().toLowerCase().replace(/^security\./, '');
    if (fromOperation && !fromOperation.startsWith('incident_')) return fromOperation;

    const normalizedReasonCode = String(reasonCode || '').trim().toLowerCase();
    if (normalizedReasonCode) return normalizedReasonCode;

    return 'security_signal';
};

const toSecurityIncidentEvent = (entry = {}) => {
    if (!isSecuritySignalAuditLog(entry)) return null;
    const metadata = entry?.metadata && typeof entry.metadata === 'object' ? entry.metadata : {};
    const createdAt = entry?.created_at || new Date().toISOString();
    const signalCode = deriveSignalCode({
        operation: entry?.operation,
        reasonCode: entry?.reason_code,
        metadata
    });
    const incidentId = String(metadata?.incident_id || '').trim()
        || buildSecurityIncidentId({ signalCode, createdAt });

    return {
        incident_id: incidentId,
        signal_code: signalCode,
        severity: normalizeSecuritySeverity(metadata?.severity),
        incident_status: normalizeSecurityIncidentStatus(metadata?.incident_status),
        operation: String(entry?.operation || '').trim() || null,
        reason_code: String(entry?.reason_code || '').trim() || null,
        actor_user_id: parsePositiveInt(entry?.actor_user_id),
        note: String(metadata?.note || metadata?.message || '').trim() || null,
        evidence_ref: String(metadata?.evidence_ref || '').trim() || null,
        dispatch: {
            channel: normalizeIncidentDispatchChannel(metadata?.channel),
            delivery_status: normalizeIncidentDeliveryStatus(metadata?.delivery_status),
            attempted_at: metadata?.attempted_at || null,
            error: String(metadata?.error || '').trim() || null,
            target_configured: metadata?.target_configured === true,
            dispatch_reference: String(metadata?.dispatch_reference || '').trim() || null
        },
        created_at: createdAt
    };
};

const summarizeSecurityIncidents = (logs = []) => {
    const incidents = new Map();
    const ordered = Array.isArray(logs) ? [...logs].sort((a, b) => (
        new Date(a?.created_at || 0).getTime() - new Date(b?.created_at || 0).getTime()
    )) : [];

    ordered.forEach((entry) => {
        const event = toSecurityIncidentEvent(entry);
        if (!event) return;

        const existing = incidents.get(event.incident_id) || {
            incident_id: event.incident_id,
            signal_code: event.signal_code,
            severity: event.severity,
            status: SECURITY_INCIDENT_STATUS.NEW,
            opened_at: event.created_at,
            updated_at: event.created_at,
            event_count: 0,
            latest_note: null,
            latest_evidence_ref: null,
            latest_reason_code: null,
            dispatch: null
        };

        existing.signal_code = event.signal_code || existing.signal_code;
        existing.severity = event.severity || existing.severity;
        existing.status = event.incident_status;
        existing.updated_at = event.created_at;
        existing.event_count += 1;
        existing.latest_reason_code = event.reason_code || existing.latest_reason_code;
        if (event.note) existing.latest_note = event.note;
        if (event.evidence_ref) existing.latest_evidence_ref = event.evidence_ref;
        if (event.dispatch?.attempted_at || event.dispatch?.delivery_status || event.dispatch?.error) {
            existing.dispatch = {
                channel: event.dispatch.channel,
                delivery_status: event.dispatch.delivery_status,
                attempted_at: event.dispatch.attempted_at || event.created_at,
                error: event.dispatch.error || null,
                target_configured: event.dispatch.target_configured === true,
                dispatch_reference: event.dispatch.dispatch_reference || null
            };
        }
        incidents.set(event.incident_id, existing);
    });

    const rows = [...incidents.values()].sort((a, b) => (
        new Date(b.updated_at || 0).getTime() - new Date(a.updated_at || 0).getTime()
    ));

    const counts = rows.reduce((acc, entry) => {
        acc.total += 1;
        acc[entry.status] = (acc[entry.status] || 0) + 1;
        if (entry.status !== SECURITY_INCIDENT_STATUS.RESOLVED) acc.requires_action += 1;
        return acc;
    }, {
        total: 0,
        requires_action: 0,
        [SECURITY_INCIDENT_STATUS.NEW]: 0,
        [SECURITY_INCIDENT_STATUS.ACKNOWLEDGED]: 0,
        [SECURITY_INCIDENT_STATUS.RESOLVED]: 0
    });

    return {
        incidents: rows,
        counts
    };
};

const resolveTenantId = ({ tenantId, tenant }) => tenantId || tenant?.id || null;

const normalizeActorIdentity = (actorUser = null) => {
    const actorId = parsePositiveInt(actorUser?.user_id);
    if (actorId) return String(actorId);

    const actorName = String(actorUser?.email || actorUser?.username || '').trim();
    return actorName || 'system';
};

const isPlatformAdminActor = (actorUser = null) => actorUser?.is_platform_admin === true;

const isTenantMasterAdminActor = (actorUser = null) => actorUser?.is_master_admin === true;

const assertMasterAdminLevelActor = (actorUser = null) => {
    if (isPlatformAdminActor(actorUser) || isTenantMasterAdminActor(actorUser)) {
        return;
    }

    throw new DomainError(
        DomainErrorCode.AUTHORIZATION_FAILED,
        'Master-admin level access is required for this compliance operation',
        { statusCode: 403 }
    );
};

const assertTenantMasterAdminActor = (actorUser = null) => {
    if (isTenantMasterAdminActor(actorUser)) {
        return;
    }

    throw new DomainError(
        DomainErrorCode.AUTHORIZATION_FAILED,
        'Tenant master-admin access is required for this compliance operation',
        { statusCode: 403 }
    );
};

const resolveVerifierActorType = (actorUser = null) => {
    if (isPlatformAdminActor(actorUser)) {
        return COMPLIANCE_VERIFIER_ACTOR_TYPE.PLATFORM_ADMIN;
    }
    if (isTenantMasterAdminActor(actorUser)) {
        return COMPLIANCE_VERIFIER_ACTOR_TYPE.TENANT_MASTER_ADMIN;
    }
    return null;
};

const buildVerificationMutation = ({ action, verifiedByActorType, verifiedByUserId, verificationNote, verificationEvidenceRef }) => {
    const base = {
        verified_by_actor_type: verifiedByActorType,
        verified_by_user_id: verifiedByUserId,
        verified_at: new Date(),
        verification_note: verificationNote || null,
        verification_evidence_ref: verificationEvidenceRef || null
    };

    if (action === 'verify') {
        return {
            ...base,
            verification_status: COMPLIANCE_VERIFICATION_STATUS.VERIFIED
        };
    }

    if (action === 'reject') {
        return {
            ...base,
            verification_status: COMPLIANCE_VERIFICATION_STATUS.REJECTED
        };
    }

    return {
        ...base,
        verification_status: COMPLIANCE_VERIFICATION_STATUS.REVOKED
    };
};

const buildComplianceDomainError = (decision, fallbackMessage = 'Compliance policy blocked operation') => {
    const isDeny = decision?.decision === COMPLIANCE_DECISION.DENY;
    return new DomainError(
        isDeny ? DomainErrorCode.AUTHORIZATION_FAILED : DomainErrorCode.VALIDATION_FAILED,
        `${fallbackMessage}. Reason: ${decision?.reason_code || COMPLIANCE_REASON_CODE.ALLOWED}`,
        {
            statusCode: isDeny ? 403 : 422,
            details: {
                compliance: decision
            }
        }
    );
};

const failWithDomainOrInternal = (error, fallbackMessage) => {
    if (error instanceof DomainError) {
        return fail(error);
    }

    return fail(new DomainError(
        DomainErrorCode.INTERNAL_ERROR,
        error?.message || fallbackMessage,
        { statusCode: 500 }
    ));
};

const serializeAuditError = (error) => ({
    message: error?.message || 'Unknown error',
    name: error?.name || 'Error',
    code: error?.code || null
});

const persistAuditLogWithFallback = async ({
    complianceRepository,
    logger,
    auditPayload = {},
    fallbackContext = {},
    primaryOptions = {}
}) => {
    try {
        const record = await complianceRepository.createAuditLog(auditPayload, primaryOptions);
        return { persisted: 'primary', record };
    } catch (primaryError) {
        try {
            await complianceRepository.createAuditFailureLog({
                tenant_id: auditPayload.tenant_id || null,
                event_type: auditPayload.event_type || 'unknown',
                operation: auditPayload.operation || null,
                decision: auditPayload.decision || null,
                reason_code: auditPayload.reason_code || null,
                actor_user_id: auditPayload.actor_user_id || null,
                audit_payload: auditPayload,
                fallback_context: fallbackContext,
                primary_error_message: primaryError?.message || 'Unknown primary audit log persistence error',
                primary_error_name: primaryError?.name || null,
                primary_error_code: primaryError?.code || null
            });
            logger?.warn?.(
                `[Compliance] Primary audit log persistence failed; fallback stored for ${auditPayload.event_type || 'unknown_event'}`
            );
            return { persisted: 'fallback', primaryError };
        } catch (fallbackError) {
            logger?.error?.('[Compliance] Failed to persist compliance audit log and fallback record', {
                tenant_id: auditPayload.tenant_id || null,
                event_type: auditPayload.event_type || null,
                operation: auditPayload.operation || null,
                fallback_context: fallbackContext,
                primary_error: serializeAuditError(primaryError),
                fallback_error: serializeAuditError(fallbackError)
            });
            return { persisted: 'none', primaryError, fallbackError };
        }
    }
};

const recordIncidentDispatchAttempt = async ({
    complianceRepository,
    logger,
    tenantId,
    incidentId,
    incidentStatus,
    signalCode,
    severity,
    actorUserId,
    triggerEvent
}) => {
    const channel = normalizeIncidentDispatchChannel(process.env.COMPLIANCE_INCIDENT_NOTIFY_CHANNEL || 'audit_only');
    const outcome = resolveIncidentDispatchOutcome({ channel });
    const dispatchPayload = {
        channel,
        delivery_status: normalizeIncidentDeliveryStatus(outcome.delivery_status),
        attempted_at: new Date().toISOString(),
        error: outcome.error,
        target_configured: outcome.target_configured === true
    };

    if (outcome.dispatch_reference) {
        dispatchPayload.dispatch_reference = outcome.dispatch_reference;
    }

    const persistence = await persistAuditLogWithFallback({
        complianceRepository,
        logger,
        auditPayload: {
            tenant_id: tenantId,
            event_type: SECURITY_SIGNAL_EVENT_TYPE,
            operation: 'security.incident_notify_attempt',
            decision: COMPLIANCE_DECISION.ALLOW,
            reason_code: 'SECURITY_INCIDENT_NOTIFY_ATTEMPT',
            actor_user_id: parsePositiveInt(actorUserId),
            metadata: {
                incident_id: incidentId,
                incident_status: normalizeSecurityIncidentStatus(incidentStatus),
                signal_code: String(signalCode || '').trim().toLowerCase() || 'security_signal',
                severity: normalizeSecuritySeverity(severity),
                trigger_event: String(triggerEvent || '').trim() || 'security_signal',
                ...dispatchPayload
            }
        },
        fallbackContext: {
            path: 'recordIncidentDispatchAttempt',
            stage: 'security_incident_notify_attempt'
        }
    });

    return {
        ...dispatchPayload,
        audit_persistence: persistence.persisted
    };
};

export const buildEvaluateComplianceOperationUseCase = ({ complianceRepository, getSettingsSnapshot }) => {
    return async ({ tenantId, tenant, operation, context = {} }) => {
        const resolvedTenantId = resolveTenantId({ tenantId, tenant });
        if (!resolvedTenantId) {
            return fail(new DomainError(
                DomainErrorCode.TENANT_CONTEXT_MISSING,
                'Tenant context is required for compliance evaluation',
                { statusCode: 400 }
            ));
        }

        try {
            const effectiveTenant = tenant || await complianceRepository.findTenantById(resolvedTenantId);
            if (!effectiveTenant) {
                return fail(new DomainError(
                    DomainErrorCode.TENANT_NOT_FOUND,
                    'Tenant not found',
                    { statusCode: 404 }
                ));
            }

            const effectiveModeState = effectiveTenant.compliance_mode_state
                || COMPLIANCE_MODE_STATE.NON_COMPLIANT_ACTIVE;
            const needsStatefulChecks = effectiveModeState === COMPLIANCE_MODE_STATE.COMPLIANT_ACTIVE;

            let artifacts = [];
            let peripherals = [];
            let settings = context.settings || {};
            const normalizedProfile = normalizeComplianceProfileValue(effectiveTenant.compliance_profile);
            let checklistEvidence = {
                fiscal_accumulator_stream_ready: true,
                fiscal_lifetime_grand_total_cents: 0,
                audit_log_append_only_enforced: true,
                audit_append_only_trigger_names: [],
                payment_handoff_policy_ready: resolvePaymentHandoffPolicyReady(normalizedProfile)
            };

            if (needsStatefulChecks) {
                [artifacts, peripherals] = await Promise.all([
                    complianceRepository.listArtifactsByTenantId(effectiveTenant.id),
                    complianceRepository.listPeripheralsByTenantId(effectiveTenant.id)
                ]);
            }
            if (needsStatefulChecks) {
                checklistEvidence = await resolveChecklistEvidence({
                    complianceRepository,
                    tenantId: effectiveTenant.id,
                    profile: normalizedProfile
                });
            }

            if (!context.settings && typeof getSettingsSnapshot === 'function') {
                try {
                    settings = await getSettingsSnapshot();
                } catch {
                    settings = {};
                }
            }

            const decision = evaluateComplianceDecision({
                tenant: effectiveTenant,
                operation,
                context,
                artifacts,
                peripherals,
                settings,
                evidence: checklistEvidence
            });

            return ok({
                tenant: effectiveTenant,
                decision,
                artifacts,
                peripherals,
                settings
            });
        } catch (error) {
            return fail(new DomainError(
                DomainErrorCode.INTERNAL_ERROR,
                error.message || 'Compliance evaluation failed',
                { statusCode: 500 }
            ));
        }
    };
};

export const buildAssertComplianceOperationAllowedUseCase = ({
    evaluateComplianceOperationUseCase,
    complianceRepository,
    logger
}) => {
    return async ({ tenantId, tenant, operation, context = {}, actorUser = null }) => {
        const evaluation = await evaluateComplianceOperationUseCase({ tenantId, tenant, operation, context });
        if (!evaluation.success) {
            return evaluation;
        }

        const { tenant: effectiveTenant, decision } = evaluation.data;
        if (decision.decision !== COMPLIANCE_DECISION.ALLOW) {
            const actorUserId = parsePositiveInt(actorUser?.user_id);
            const metadata = {
                operation,
                context,
                checklist: decision.checklist,
                obligations: decision.obligations
            };

            await persistAuditLogWithFallback({
                complianceRepository,
                logger,
                auditPayload: {
                    tenant_id: effectiveTenant.id,
                    event_type: 'blocked_operation',
                    operation,
                    decision: decision.decision,
                    reason_code: decision.reason_code,
                    actor_user_id: actorUserId,
                    metadata
                },
                fallbackContext: {
                    path: 'buildAssertComplianceOperationAllowedUseCase',
                    stage: 'blocked_operation'
                }
            });

            return fail(buildComplianceDomainError(decision));
        }

        return ok(evaluation.data);
    };
};

export const buildGetComplianceProfileUseCase = ({ complianceRepository, getSettingsSnapshot }) => {
    return async ({ tenantId }) => {
        if (!tenantId) {
            return fail(new DomainError(
                DomainErrorCode.TENANT_CONTEXT_MISSING,
                'Tenant context is required',
                { statusCode: 400 }
            ));
        }

        try {
            const [tenant, artifacts, peripherals, settings] = await Promise.all([
                complianceRepository.findTenantById(tenantId),
                complianceRepository.listArtifactsByTenantId(tenantId),
                complianceRepository.listPeripheralsByTenantId(tenantId),
                typeof getSettingsSnapshot === 'function' ? getSettingsSnapshot() : Promise.resolve({})
            ]);

            if (!tenant) {
                return fail(new DomainError(
                    DomainErrorCode.TENANT_NOT_FOUND,
                    'Tenant not found',
                    { statusCode: 404 }
                ));
            }

            const normalizedProfile = normalizeComplianceProfileValue(tenant.compliance_profile);
            const checklistEvidence = await resolveChecklistEvidence({
                complianceRepository,
                tenantId: tenant.id,
                profile: normalizedProfile
            });
            const checklist = evaluateComplianceChecklist({
                tenant,
                complianceProfile: normalizedProfile,
                artifacts,
                peripherals,
                settings,
                evidence: checklistEvidence
            });

            return ok({
                mode_state: tenant.compliance_mode_state,
                mode_choice_required: tenant.compliance_mode_choice_required === true,
                mode_selected_at: tenant.compliance_mode_selected_at,
                mode_selected_by: tenant.compliance_mode_selected_by,
                activated_at: tenant.compliance_activated_at,
                policy_version: tenant.compliance_policy_version,
                compliance_cycle_version: Number.parseInt(tenant.compliance_cycle_version || 0, 10) || 0,
                compliance_revert_last_cycle_version: Number.parseInt(tenant.compliance_revert_last_cycle_version || 0, 10) || 0,
                can_revert_to_non_compliant:
                    ['compliant_pending', 'compliant_active'].includes(String(tenant.compliance_mode_state || '').trim())
                    && (Number.parseInt(tenant.compliance_revert_last_cycle_version || 0, 10) || 0)
                        < (Number.parseInt(tenant.compliance_cycle_version || 0, 10) || 0),
                profile: normalizedProfile,
                checklist,
                counts: {
                    artifacts: artifacts.length,
                    peripherals: peripherals.length
                }
            });
        } catch (error) {
            return fail(new DomainError(
                DomainErrorCode.INTERNAL_ERROR,
                error.message || 'Failed to retrieve compliance profile',
                { statusCode: 500 }
            ));
        }
    };
};

export const buildSelectComplianceModeUseCase = ({ complianceRepository, logger }) => {
    return async ({ tenantId, modeChoice, actorUser = null }) => {
        if (!tenantId) {
            return fail(new DomainError(
                DomainErrorCode.TENANT_CONTEXT_MISSING,
                'Tenant context is required',
                { statusCode: 400 }
            ));
        }

        const normalizedModeChoice = String(modeChoice || '').trim().toLowerCase();
        if (![COMPLIANCE_MODE_CHOICES.NON_COMPLIANT, COMPLIANCE_MODE_CHOICES.COMPLIANT].includes(normalizedModeChoice)) {
            return fail(new DomainError(
                DomainErrorCode.VALIDATION_FAILED,
                'mode_choice must be either non_compliant or compliant',
                { statusCode: 422 }
            ));
        }

        const nextState = normalizedModeChoice === COMPLIANCE_MODE_CHOICES.COMPLIANT
            ? COMPLIANCE_MODE_STATE.COMPLIANT_PENDING
            : COMPLIANCE_MODE_STATE.NON_COMPLIANT_ACTIVE;

        try {
            assertMasterAdminLevelActor(actorUser);
            const tenant = await complianceRepository.findTenantById(tenantId);
            if (!tenant) {
                return fail(new DomainError(
                    DomainErrorCode.TENANT_NOT_FOUND,
                    'Tenant not found',
                    { statusCode: 404 }
                ));
            }

            if (
                tenant.compliance_mode_choice_required !== true
                && tenant.compliance_mode_state
            ) {
                return fail(new DomainError(
                    DomainErrorCode.CONFLICT,
                    'Compliance mode has already been selected for this tenant',
                    { statusCode: 409 }
                ));
            }

            const transaction = await complianceRepository.beginTransaction();
            try {
                const currentCycleVersion = Number.parseInt(tenant.compliance_cycle_version || 0, 10) || 0;
                const shouldIncrementCycle = nextState === COMPLIANCE_MODE_STATE.COMPLIANT_PENDING
                    && tenant.compliance_mode_state !== COMPLIANCE_MODE_STATE.COMPLIANT_PENDING;
                const updated = await complianceRepository.updateTenantById(tenantId, {
                    compliance_mode_state: nextState,
                    compliance_mode_choice_required: false,
                    compliance_mode_selected_at: new Date(),
                    compliance_mode_selected_by: normalizeActorIdentity(actorUser),
                    compliance_policy_version: '2026.04.07',
                    ...(shouldIncrementCycle
                        ? { compliance_cycle_version: currentCycleVersion + 1 }
                        : {})
                }, {
                    transaction,
                    lock: true
                });

                await persistAuditLogWithFallback({
                    complianceRepository,
                    logger,
                    auditPayload: {
                        tenant_id: tenantId,
                        event_type: 'mode_selection',
                        operation: COMPLIANCE_OPERATION.REQUEST_PREFLIGHT,
                        decision: COMPLIANCE_DECISION.ALLOW,
                        reason_code: COMPLIANCE_REASON_CODE.ALLOWED,
                        actor_user_id: parsePositiveInt(actorUser?.user_id),
                        metadata: {
                            mode_choice: normalizedModeChoice,
                            mode_state: nextState,
                            compliance_cycle_version: shouldIncrementCycle ? currentCycleVersion + 1 : currentCycleVersion
                        }
                    },
                    fallbackContext: {
                        path: 'buildSelectComplianceModeUseCase',
                        stage: 'mode_selection'
                    },
                    primaryOptions: { transaction }
                });

                await transaction.commit();
                return ok({
                    mode_state: updated.compliance_mode_state,
                    mode_choice_required: updated.compliance_mode_choice_required,
                    mode_selected_at: updated.compliance_mode_selected_at,
                    mode_selected_by: updated.compliance_mode_selected_by
                });
            } catch (error) {
                if (!transaction.finished) {
                    await transaction.rollback();
                }
                throw error;
            }
        } catch (error) {
            return failWithDomainOrInternal(error, 'Failed to select compliance mode');
        }
    };
};

export const buildUpgradeToCompliantUseCase = ({ complianceRepository, logger }) => {
    return async ({ tenantId, actorUser = null }) => {
        if (!tenantId) {
            return fail(new DomainError(
                DomainErrorCode.TENANT_CONTEXT_MISSING,
                'Tenant context is required',
                { statusCode: 400 }
            ));
        }

        try {
            assertMasterAdminLevelActor(actorUser);
            const tenant = await complianceRepository.findTenantById(tenantId);
            if (!tenant) {
                return fail(new DomainError(
                    DomainErrorCode.TENANT_NOT_FOUND,
                    'Tenant not found',
                    { statusCode: 404 }
                ));
            }

            if (tenant.compliance_mode_choice_required === true || !tenant.compliance_mode_state) {
                return fail(new DomainError(
                    DomainErrorCode.VALIDATION_FAILED,
                    'Compliance mode must be selected before upgrade',
                    { statusCode: 422 }
                ));
            }

            if (tenant.compliance_mode_state === COMPLIANCE_MODE_STATE.COMPLIANT_ACTIVE) {
                return fail(new DomainError(
                    DomainErrorCode.CONFLICT,
                    'Tenant is already in compliant_active mode',
                    { statusCode: 409 }
                ));
            }

            if (tenant.compliance_mode_state === COMPLIANCE_MODE_STATE.COMPLIANT_PENDING) {
                return ok({
                    mode_state: tenant.compliance_mode_state,
                    message: 'Tenant is already in compliant_pending mode'
                });
            }

            const transaction = await complianceRepository.beginTransaction();
            try {
                const currentCycleVersion = Number.parseInt(tenant.compliance_cycle_version || 0, 10) || 0;
                const updated = await complianceRepository.updateTenantById(tenantId, {
                    compliance_mode_state: COMPLIANCE_MODE_STATE.COMPLIANT_PENDING,
                    compliance_mode_selected_at: new Date(),
                    compliance_mode_selected_by: normalizeActorIdentity(actorUser),
                    compliance_policy_version: '2026.04.07',
                    compliance_cycle_version: currentCycleVersion + 1
                }, {
                    transaction,
                    lock: true
                });

                await persistAuditLogWithFallback({
                    complianceRepository,
                    logger,
                    auditPayload: {
                        tenant_id: tenantId,
                        event_type: 'mode_upgrade',
                        operation: COMPLIANCE_OPERATION.REQUEST_PREFLIGHT,
                        decision: COMPLIANCE_DECISION.ALLOW,
                        reason_code: COMPLIANCE_REASON_CODE.ALLOWED,
                        actor_user_id: parsePositiveInt(actorUser?.user_id),
                        metadata: {
                            previous_mode_state: tenant.compliance_mode_state,
                            next_mode_state: COMPLIANCE_MODE_STATE.COMPLIANT_PENDING,
                            compliance_cycle_version: currentCycleVersion + 1
                        }
                    },
                    fallbackContext: {
                        path: 'buildUpgradeToCompliantUseCase',
                        stage: 'mode_upgrade'
                    },
                    primaryOptions: { transaction }
                });

                await transaction.commit();
                return ok({
                    mode_state: updated.compliance_mode_state,
                    activated_at: updated.compliance_activated_at,
                    message: 'Tenant upgraded to compliant_pending mode'
                });
            } catch (error) {
                if (!transaction.finished) {
                    await transaction.rollback();
                }
                throw error;
            }
        } catch (error) {
            return failWithDomainOrInternal(error, 'Failed to upgrade tenant compliance mode');
        }
    };
};

export const buildForceNonCompliantModeUseCase = ({ complianceRepository, logger }) => {
    return async ({ tenantId, reason, context = {}, actorUser = null }) => {
        if (!tenantId) {
            return fail(new DomainError(
                DomainErrorCode.TENANT_CONTEXT_MISSING,
                'Tenant context is required',
                { statusCode: 400 }
            ));
        }

        const normalizedReason = String(reason || '').trim();
        if (normalizedReason.length < 3) {
            return fail(new DomainError(
                DomainErrorCode.VALIDATION_FAILED,
                'reason is required and must be at least 3 characters',
                { statusCode: 422 }
            ));
        }

        if (!isPlatformAdminActor(actorUser)) {
            return fail(new DomainError(
                DomainErrorCode.AUTHORIZATION_FAILED,
                'Platform admin access is required for this compliance operation',
                { statusCode: 403 }
            ));
        }

        try {
            const tenant = await complianceRepository.findTenantById(tenantId);
            if (!tenant) {
                return fail(new DomainError(
                    DomainErrorCode.TENANT_NOT_FOUND,
                    'Tenant not found',
                    { statusCode: 404 }
                ));
            }

            if (tenant.compliance_mode_state === COMPLIANCE_MODE_STATE.NON_COMPLIANT_ACTIVE) {
                return fail(new DomainError(
                    DomainErrorCode.CONFLICT,
                    'Tenant is already in non_compliant_active mode',
                    { statusCode: 409 }
                ));
            }

            if (![COMPLIANCE_MODE_STATE.COMPLIANT_PENDING, COMPLIANCE_MODE_STATE.COMPLIANT_ACTIVE].includes(tenant.compliance_mode_state)) {
                return fail(new DomainError(
                    DomainErrorCode.VALIDATION_FAILED,
                    'Platform force non-compliant override is only allowed from compliant_pending or compliant_active',
                    { statusCode: 422 }
                ));
            }

            const transaction = await complianceRepository.beginTransaction();
            try {
                const updated = await complianceRepository.updateTenantById(tenantId, {
                    compliance_mode_state: COMPLIANCE_MODE_STATE.NON_COMPLIANT_ACTIVE,
                    compliance_mode_choice_required: false,
                    compliance_mode_override_by: normalizeActorIdentity(actorUser),
                    compliance_mode_override_at: new Date(),
                    compliance_mode_override_reason: normalizedReason
                }, {
                    transaction,
                    lock: true
                });

                const auditPersistence = await persistAuditLogWithFallback({
                    complianceRepository,
                    logger,
                    auditPayload: {
                        tenant_id: tenantId,
                        event_type: 'mode_force_non_compliant',
                        operation: 'compliance.mode.force_non_compliant',
                        decision: COMPLIANCE_DECISION.ALLOW,
                        reason_code: COMPLIANCE_REASON_CODE.ALLOWED,
                        actor_user_id: parsePositiveInt(actorUser?.user_id),
                        metadata: {
                            previous_mode_state: tenant.compliance_mode_state || null,
                            next_mode_state: COMPLIANCE_MODE_STATE.NON_COMPLIANT_ACTIVE,
                            reason: normalizedReason,
                            context: context && typeof context === 'object' ? context : {}
                        }
                    },
                    fallbackContext: {
                        path: 'buildForceNonCompliantModeUseCase',
                        stage: 'mode_force_non_compliant'
                    },
                    primaryOptions: { transaction }
                });
                if (auditPersistence?.persisted !== 'primary') {
                    throw new DomainError(
                        DomainErrorCode.INTERNAL_ERROR,
                        'Failed to persist compliance audit trail for force non-compliant operation',
                        { statusCode: 500 }
                    );
                }

                await transaction.commit();
                return ok({
                    mode_state: updated.compliance_mode_state,
                    mode_choice_required: updated.compliance_mode_choice_required === true,
                    overridden_at: updated.compliance_mode_override_at,
                    overridden_by: updated.compliance_mode_override_by
                });
            } catch (error) {
                if (!transaction.finished) {
                    await transaction.rollback();
                }
                throw error;
            }
        } catch (error) {
            return failWithDomainOrInternal(error, 'Failed to force tenant non-compliant mode');
        }
    };
};

export const buildRevertToNonCompliantModeUseCase = ({ complianceRepository, logger }) => {
    return async ({ tenantId, reason, context = {}, actorUser = null }) => {
        if (!tenantId) {
            return fail(new DomainError(
                DomainErrorCode.TENANT_CONTEXT_MISSING,
                'Tenant context is required',
                { statusCode: 400 }
            ));
        }

        const normalizedReason = String(reason || '').trim();
        if (normalizedReason.length < 3) {
            return fail(new DomainError(
                DomainErrorCode.VALIDATION_FAILED,
                'reason is required and must be at least 3 characters',
                { statusCode: 422 }
            ));
        }

        try {
            assertTenantMasterAdminActor(actorUser);
            const tenant = await complianceRepository.findTenantById(tenantId);
            if (!tenant) {
                return fail(new DomainError(
                    DomainErrorCode.TENANT_NOT_FOUND,
                    'Tenant not found',
                    { statusCode: 404 }
                ));
            }

            if (tenant.compliance_mode_state === COMPLIANCE_MODE_STATE.NON_COMPLIANT_ACTIVE) {
                return fail(new DomainError(
                    DomainErrorCode.CONFLICT,
                    'Tenant is already in non_compliant_active mode',
                    { statusCode: 409 }
                ));
            }

            if (![COMPLIANCE_MODE_STATE.COMPLIANT_PENDING, COMPLIANCE_MODE_STATE.COMPLIANT_ACTIVE].includes(tenant.compliance_mode_state)) {
                return fail(new DomainError(
                    DomainErrorCode.VALIDATION_FAILED,
                    'Tenant revert is only allowed from compliant_pending or compliant_active',
                    { statusCode: 422 }
                ));
            }

            const cycleVersion = Number.parseInt(tenant.compliance_cycle_version || 0, 10) || 0;
            const lastRevertCycleVersion = Number.parseInt(tenant.compliance_revert_last_cycle_version || 0, 10) || 0;
            if (cycleVersion <= 0) {
                return fail(new DomainError(
                    DomainErrorCode.CONFLICT,
                    'Compliance cycle is not initialized for tenant revert',
                    { statusCode: 409 }
                ));
            }

            if (lastRevertCycleVersion >= cycleVersion) {
                return fail(new DomainError(
                    DomainErrorCode.CONFLICT,
                    'Tenant revert to non-compliant has already been used in this compliance cycle',
                    { statusCode: 409 }
                ));
            }

            const transaction = await complianceRepository.beginTransaction();
            try {
                const updated = await complianceRepository.updateTenantById(tenantId, {
                    compliance_mode_state: COMPLIANCE_MODE_STATE.NON_COMPLIANT_ACTIVE,
                    compliance_mode_choice_required: false,
                    compliance_mode_revert_by: normalizeActorIdentity(actorUser),
                    compliance_mode_revert_at: new Date(),
                    compliance_mode_revert_reason: normalizedReason,
                    compliance_revert_last_cycle_version: cycleVersion
                }, {
                    transaction,
                    lock: true
                });

                const auditPersistence = await persistAuditLogWithFallback({
                    complianceRepository,
                    logger,
                    auditPayload: {
                        tenant_id: tenantId,
                        event_type: 'mode_revert_non_compliant',
                        operation: 'compliance.mode.revert_non_compliant',
                        decision: COMPLIANCE_DECISION.ALLOW,
                        reason_code: COMPLIANCE_REASON_CODE.ALLOWED,
                        actor_user_id: parsePositiveInt(actorUser?.user_id),
                        metadata: {
                            previous_mode_state: tenant.compliance_mode_state || null,
                            next_mode_state: COMPLIANCE_MODE_STATE.NON_COMPLIANT_ACTIVE,
                            reason: normalizedReason,
                            context: context && typeof context === 'object' ? context : {},
                            compliance_cycle_version: cycleVersion,
                            compliance_revert_last_cycle_version: cycleVersion
                        }
                    },
                    fallbackContext: {
                        path: 'buildRevertToNonCompliantModeUseCase',
                        stage: 'mode_revert_non_compliant'
                    },
                    primaryOptions: { transaction }
                });
                if (auditPersistence?.persisted !== 'primary') {
                    throw new DomainError(
                        DomainErrorCode.INTERNAL_ERROR,
                        'Failed to persist compliance audit trail for revert non-compliant operation',
                        { statusCode: 500 }
                    );
                }

                await transaction.commit();
                return ok({
                    mode_state: updated.compliance_mode_state,
                    mode_choice_required: updated.compliance_mode_choice_required === true,
                    reverted_at: updated.compliance_mode_revert_at,
                    reverted_by: updated.compliance_mode_revert_by,
                    compliance_cycle_version: cycleVersion,
                    compliance_revert_last_cycle_version: cycleVersion
                });
            } catch (error) {
                if (!transaction.finished) {
                    await transaction.rollback();
                }
                throw error;
            }
        } catch (error) {
            return failWithDomainOrInternal(error, 'Failed to revert tenant to non-compliant mode');
        }
    };
};

export const buildGetComplianceChecklistUseCase = ({ complianceRepository, getSettingsSnapshot }) => {
    return async ({ tenantId, terminalId = null }) => {
        if (!tenantId) {
            return fail(new DomainError(
                DomainErrorCode.TENANT_CONTEXT_MISSING,
                'Tenant context is required',
                { statusCode: 400 }
            ));
        }

        try {
            const [tenant, artifacts, peripherals, settings] = await Promise.all([
                complianceRepository.findTenantById(tenantId),
                complianceRepository.listArtifactsByTenantId(tenantId),
                complianceRepository.listPeripheralsByTenantId(tenantId),
                typeof getSettingsSnapshot === 'function' ? getSettingsSnapshot() : Promise.resolve({})
            ]);

            if (!tenant) {
                return fail(new DomainError(
                    DomainErrorCode.TENANT_NOT_FOUND,
                    'Tenant not found',
                    { statusCode: 404 }
                ));
            }

            const normalizedProfile = normalizeComplianceProfileValue(tenant.compliance_profile);
            const checklistEvidence = await resolveChecklistEvidence({
                complianceRepository,
                tenantId: tenant.id,
                profile: normalizedProfile
            });
            const checklist = evaluateComplianceChecklist({
                tenant,
                complianceProfile: normalizedProfile,
                artifacts,
                peripherals,
                settings,
                terminalId,
                evidence: checklistEvidence
            });

            return ok(checklist);
        } catch (error) {
            return failWithDomainOrInternal(error, 'Failed to build compliance checklist');
        }
    };
};

export const buildActivateCompliantModeUseCase = ({
    complianceRepository,
    getComplianceChecklistUseCase,
    logger
}) => {
    return async ({ tenantId, actorUser = null, confirmationText = '' }) => {
        if (!tenantId) {
            return fail(new DomainError(
                DomainErrorCode.TENANT_CONTEXT_MISSING,
                'Tenant context is required',
                { statusCode: 400 }
            ));
        }

        if (String(confirmationText || '').trim() !== ACTIVATION_CONFIRMATION_TEXT) {
            return fail(new DomainError(
                DomainErrorCode.VALIDATION_FAILED,
                `confirmation_text must match ${ACTIVATION_CONFIRMATION_TEXT}`,
                {
                    statusCode: 422,
                    details: {
                        field: 'confirmation_text',
                        expected: ACTIVATION_CONFIRMATION_TEXT
                    }
                }
            ));
        }

        try {
            assertMasterAdminLevelActor(actorUser);
            const tenant = await complianceRepository.findTenantById(tenantId);
            if (!tenant) {
                return fail(new DomainError(
                    DomainErrorCode.TENANT_NOT_FOUND,
                    'Tenant not found',
                    { statusCode: 404 }
                ));
            }

            if (tenant.compliance_mode_state !== COMPLIANCE_MODE_STATE.COMPLIANT_PENDING) {
                return fail(new DomainError(
                    DomainErrorCode.CONFLICT,
                    'Tenant must be in compliant_pending mode before activation',
                    { statusCode: 409 }
                ));
            }

            const checklistResult = await getComplianceChecklistUseCase({ tenantId });
            if (!checklistResult.success) {
                return checklistResult;
            }

            const checklist = checklistResult.data;
            if (!checklist.ready_for_compliant_activation) {
                return fail(new DomainError(
                    DomainErrorCode.VALIDATION_FAILED,
                    'Compliance activation checklist is incomplete',
                    {
                        statusCode: 422,
                        details: {
                            checklist
                        }
                    }
                ));
            }

            const transaction = await complianceRepository.beginTransaction();
            try {
                const updated = await complianceRepository.updateTenantById(tenantId, {
                    compliance_mode_state: COMPLIANCE_MODE_STATE.COMPLIANT_ACTIVE,
                    compliance_activated_at: new Date(),
                    compliance_mode_selected_by: normalizeActorIdentity(actorUser),
                    compliance_policy_version: '2026.04.07'
                }, {
                    transaction,
                    lock: true
                });

                await persistAuditLogWithFallback({
                    complianceRepository,
                    logger,
                    auditPayload: {
                        tenant_id: tenantId,
                        event_type: 'mode_activation',
                        operation: COMPLIANCE_OPERATION.REQUEST_PREFLIGHT,
                        decision: COMPLIANCE_DECISION.ALLOW,
                        reason_code: COMPLIANCE_REASON_CODE.ALLOWED,
                        actor_user_id: parsePositiveInt(actorUser?.user_id),
                        metadata: {
                            checklist,
                            activated_at: updated.compliance_activated_at
                        }
                    },
                    fallbackContext: {
                        path: 'buildActivateCompliantModeUseCase',
                        stage: 'mode_activation'
                    },
                    primaryOptions: { transaction }
                });

                await transaction.commit();
                return ok({
                    mode_state: updated.compliance_mode_state,
                    activated_at: updated.compliance_activated_at,
                    policy_version: updated.compliance_policy_version
                });
            } catch (error) {
                if (!transaction.finished) {
                    await transaction.rollback();
                }
                throw error;
            }
        } catch (error) {
            return failWithDomainOrInternal(error, 'Failed to activate compliant mode');
        }
    };
};

export const buildUpdateComplianceProfileUseCase = ({ complianceRepository, logger }) => {
    return async ({ tenantId, profilePatch, actorUser = null }) => {
        if (!tenantId) {
            return fail(new DomainError(
                DomainErrorCode.TENANT_CONTEXT_MISSING,
                'Tenant context is required',
                { statusCode: 400 }
            ));
        }

        if (!profilePatch || typeof profilePatch !== 'object' || Array.isArray(profilePatch)) {
            return fail(new DomainError(
                DomainErrorCode.VALIDATION_FAILED,
                'profile_patch must be an object',
                { statusCode: 422 }
            ));
        }

        try {
            const updated = await complianceRepository.updateComplianceProfile(tenantId, profilePatch, {
                lock: true
            });
            if (!updated) {
                return fail(new DomainError(
                    DomainErrorCode.TENANT_NOT_FOUND,
                    'Tenant not found',
                    { statusCode: 404 }
                ));
            }

            await persistAuditLogWithFallback({
                complianceRepository,
                logger,
                auditPayload: {
                    tenant_id: tenantId,
                    event_type: 'preflight_evaluation',
                    operation: COMPLIANCE_OPERATION.REQUEST_PREFLIGHT,
                    decision: COMPLIANCE_DECISION.ALLOW,
                    reason_code: COMPLIANCE_REASON_CODE.ALLOWED,
                    actor_user_id: parsePositiveInt(actorUser?.user_id),
                    metadata: {
                        profile_patch_keys: Object.keys(profilePatch)
                    }
                },
                fallbackContext: {
                    path: 'buildUpdateComplianceProfileUseCase',
                    stage: 'profile_update'
                }
            });

            return ok({
                profile: updated.compliance_profile,
                mode_state: updated.tenant.compliance_mode_state,
                policy_version: updated.tenant.compliance_policy_version
            });
        } catch (error) {
            return fail(new DomainError(
                DomainErrorCode.INTERNAL_ERROR,
                error.message || 'Failed to update compliance profile',
                { statusCode: 500 }
            ));
        }
    };
};

export const buildListComplianceArtifactsUseCase = ({ complianceRepository }) => {
    return async ({ tenantId }) => {
        if (!tenantId) {
            return fail(new DomainError(
                DomainErrorCode.TENANT_CONTEXT_MISSING,
                'Tenant context is required',
                { statusCode: 400 }
            ));
        }

        try {
            const artifacts = await complianceRepository.listArtifactsByTenantId(tenantId);
            return ok({ artifacts });
        } catch (error) {
            return fail(new DomainError(
                DomainErrorCode.INTERNAL_ERROR,
                error.message || 'Failed to list compliance artifacts',
                { statusCode: 500 }
            ));
        }
    };
};

export const buildCreateComplianceArtifactUseCase = ({ complianceRepository, logger }) => {
    return async ({ tenantId, payload, actorUser = null }) => {
        if (!tenantId) {
            return fail(new DomainError(
                DomainErrorCode.TENANT_CONTEXT_MISSING,
                'Tenant context is required',
                { statusCode: 400 }
            ));
        }

        if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
            return fail(new DomainError(
                DomainErrorCode.VALIDATION_FAILED,
                'payload must be an object',
                { statusCode: 422 }
            ));
        }

        try {
            const created = await complianceRepository.createArtifact({
                tenant_id: tenantId,
                artifact_type: payload.artifact_type,
                artifact_name: payload.artifact_name,
                reference_number: payload.reference_number || null,
                valid_from: payload.valid_from || null,
                valid_until: payload.valid_until || null,
                status: 'pending',
                verification_status: COMPLIANCE_VERIFICATION_STATUS.PENDING_REVIEW,
                metadata: payload.metadata || {}
            });

            await persistAuditLogWithFallback({
                complianceRepository,
                logger,
                auditPayload: {
                    tenant_id: tenantId,
                    event_type: 'preflight_evaluation',
                    operation: 'compliance.artifacts.create',
                    decision: COMPLIANCE_DECISION.ALLOW,
                    reason_code: COMPLIANCE_REASON_CODE.ALLOWED,
                    actor_user_id: parsePositiveInt(actorUser?.user_id),
                    metadata: {
                        artifact_id: created.tenant_compliance_artifact_id,
                        artifact_type: created.artifact_type
                    }
                },
                fallbackContext: {
                    path: 'buildCreateComplianceArtifactUseCase',
                    stage: 'artifact_create'
                }
            });

            return ok(created);
        } catch (error) {
            return fail(new DomainError(
                DomainErrorCode.INTERNAL_ERROR,
                error.message || 'Failed to create compliance artifact',
                { statusCode: 500 }
            ));
        }
    };
};

export const buildUpdateComplianceArtifactUseCase = ({ complianceRepository }) => {
    return async ({ tenantId, artifactId, payload }) => {
        if (!tenantId) {
            return fail(new DomainError(
                DomainErrorCode.TENANT_CONTEXT_MISSING,
                'Tenant context is required',
                { statusCode: 400 }
            ));
        }

        const normalizedArtifactId = parsePositiveInt(artifactId);
        if (!normalizedArtifactId) {
            return fail(new DomainError(
                DomainErrorCode.VALIDATION_FAILED,
                'artifactId must be a positive integer',
                { statusCode: 422 }
            ));
        }

        try {
            const mutablePayload = { ...(payload || {}) };
            delete mutablePayload.status;
            delete mutablePayload.verification_status;
            delete mutablePayload.verified_by_actor_type;
            delete mutablePayload.verified_by_user_id;
            delete mutablePayload.verified_at;
            delete mutablePayload.verification_note;
            delete mutablePayload.verification_evidence_ref;

            const updated = await complianceRepository.updateArtifactById(normalizedArtifactId, mutablePayload, { lock: true });
            if (!updated || updated.tenant_id !== tenantId) {
                return fail(new DomainError(
                    DomainErrorCode.RESOURCE_NOT_FOUND,
                    'Compliance artifact not found',
                    { statusCode: 404 }
                ));
            }

            return ok(updated);
        } catch (error) {
            return fail(new DomainError(
                DomainErrorCode.INTERNAL_ERROR,
                error.message || 'Failed to update compliance artifact',
                { statusCode: 500 }
            ));
        }
    };
};

export const buildUpdateComplianceArtifactVerificationUseCase = ({ complianceRepository, logger }) => {
    return async ({ tenantId, artifactId, payload = {}, actorUser = null }) => {
        if (!tenantId) {
            return fail(new DomainError(
                DomainErrorCode.TENANT_CONTEXT_MISSING,
                'Tenant context is required',
                { statusCode: 400 }
            ));
        }

        const normalizedArtifactId = parsePositiveInt(artifactId);
        if (!normalizedArtifactId) {
            return fail(new DomainError(
                DomainErrorCode.VALIDATION_FAILED,
                'artifactId must be a positive integer',
                { statusCode: 422 }
            ));
        }

        const action = String(payload.action || '').trim().toLowerCase();
        if (!['verify', 'reject', 'revoke'].includes(action)) {
            return fail(new DomainError(
                DomainErrorCode.VALIDATION_FAILED,
                'action must be one of: verify, reject, revoke',
                { statusCode: 422 }
            ));
        }

        try {
            assertMasterAdminLevelActor(actorUser);
            const verifierActorType = resolveVerifierActorType(actorUser);
            if (!verifierActorType) {
                return fail(new DomainError(
                    DomainErrorCode.AUTHORIZATION_FAILED,
                    'Verifier actor type is not allowed',
                    { statusCode: 403 }
                ));
            }

            const mutation = buildVerificationMutation({
                action,
                verifiedByActorType: verifierActorType,
                verifiedByUserId: parsePositiveInt(actorUser?.user_id),
                verificationNote: payload.verification_note,
                verificationEvidenceRef: payload.verification_evidence_ref
            });

            if (action === 'verify') mutation.status = 'valid';
            if (action === 'revoke') mutation.status = 'revoked';

            const updated = await complianceRepository.updateArtifactById(normalizedArtifactId, mutation, { lock: true });
            if (!updated || updated.tenant_id !== tenantId) {
                return fail(new DomainError(
                    DomainErrorCode.RESOURCE_NOT_FOUND,
                    'Compliance artifact not found',
                    { statusCode: 404 }
                ));
            }

            await persistAuditLogWithFallback({
                complianceRepository,
                logger,
                auditPayload: {
                    tenant_id: tenantId,
                    event_type: 'preflight_evaluation',
                    operation: 'compliance.artifacts.verification',
                    decision: COMPLIANCE_DECISION.ALLOW,
                    reason_code: COMPLIANCE_REASON_CODE.ALLOWED,
                    actor_user_id: parsePositiveInt(actorUser?.user_id),
                    metadata: {
                        artifact_id: normalizedArtifactId,
                        action,
                        verification_status: updated.verification_status,
                        verifier_actor_type: verifierActorType
                    }
                },
                fallbackContext: {
                    path: 'buildUpdateComplianceArtifactVerificationUseCase',
                    stage: 'artifact_verification'
                }
            });

            return ok(updated);
        } catch (error) {
            return failWithDomainOrInternal(error, 'Failed to update compliance artifact verification');
        }
    };
};

export const buildListCompliancePeripheralsUseCase = ({ complianceRepository }) => {
    return async ({ tenantId }) => {
        if (!tenantId) {
            return fail(new DomainError(
                DomainErrorCode.TENANT_CONTEXT_MISSING,
                'Tenant context is required',
                { statusCode: 400 }
            ));
        }

        try {
            const peripherals = await complianceRepository.listPeripheralsByTenantId(tenantId);
            return ok({ peripherals });
        } catch (error) {
            return fail(new DomainError(
                DomainErrorCode.INTERNAL_ERROR,
                error.message || 'Failed to list compliance peripherals',
                { statusCode: 500 }
            ));
        }
    };
};

export const buildCreateCompliancePeripheralUseCase = ({ complianceRepository, logger }) => {
    return async ({ tenantId, payload, actorUser = null }) => {
        if (!tenantId) {
            return fail(new DomainError(
                DomainErrorCode.TENANT_CONTEXT_MISSING,
                'Tenant context is required',
                { statusCode: 400 }
            ));
        }

        if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
            return fail(new DomainError(
                DomainErrorCode.VALIDATION_FAILED,
                'payload must be an object',
                { statusCode: 422 }
            ));
        }

        try {
            const created = await complianceRepository.createPeripheral({
                tenant_id: tenantId,
                terminal_id: payload.terminal_id || null,
                is_shared: payload.is_shared === true,
                device_class: payload.device_class,
                brand: payload.brand,
                model: payload.model,
                serial_number: payload.serial_number,
                accreditation_reference: payload.accreditation_reference || null,
                accreditation_valid_from: payload.accreditation_valid_from || null,
                accreditation_valid_until: payload.accreditation_valid_until || null,
                status: 'pending',
                verification_status: COMPLIANCE_VERIFICATION_STATUS.PENDING_REVIEW,
                metadata: payload.metadata || {}
            });

            await persistAuditLogWithFallback({
                complianceRepository,
                logger,
                auditPayload: {
                    tenant_id: tenantId,
                    event_type: 'preflight_evaluation',
                    operation: 'compliance.peripherals.create',
                    decision: COMPLIANCE_DECISION.ALLOW,
                    reason_code: COMPLIANCE_REASON_CODE.ALLOWED,
                    actor_user_id: parsePositiveInt(actorUser?.user_id),
                    metadata: {
                        peripheral_id: created.tenant_compliance_peripheral_id,
                        device_class: created.device_class,
                        terminal_id: created.terminal_id
                    }
                },
                fallbackContext: {
                    path: 'buildCreateCompliancePeripheralUseCase',
                    stage: 'peripheral_create'
                }
            });

            return ok(created);
        } catch (error) {
            return fail(new DomainError(
                DomainErrorCode.INTERNAL_ERROR,
                error.message || 'Failed to create compliance peripheral',
                { statusCode: 500 }
            ));
        }
    };
};

export const buildUpdateCompliancePeripheralUseCase = ({ complianceRepository }) => {
    return async ({ tenantId, peripheralId, payload }) => {
        if (!tenantId) {
            return fail(new DomainError(
                DomainErrorCode.TENANT_CONTEXT_MISSING,
                'Tenant context is required',
                { statusCode: 400 }
            ));
        }

        const normalizedPeripheralId = parsePositiveInt(peripheralId);
        if (!normalizedPeripheralId) {
            return fail(new DomainError(
                DomainErrorCode.VALIDATION_FAILED,
                'peripheralId must be a positive integer',
                { statusCode: 422 }
            ));
        }

        try {
            const mutablePayload = { ...(payload || {}) };
            delete mutablePayload.status;
            delete mutablePayload.verification_status;
            delete mutablePayload.verified_by_actor_type;
            delete mutablePayload.verified_by_user_id;
            delete mutablePayload.verified_at;
            delete mutablePayload.verification_note;
            delete mutablePayload.verification_evidence_ref;

            const updated = await complianceRepository.updatePeripheralById(normalizedPeripheralId, mutablePayload, { lock: true });
            if (!updated || updated.tenant_id !== tenantId) {
                return fail(new DomainError(
                    DomainErrorCode.RESOURCE_NOT_FOUND,
                    'Compliance peripheral not found',
                    { statusCode: 404 }
                ));
            }

            return ok(updated);
        } catch (error) {
            return fail(new DomainError(
                DomainErrorCode.INTERNAL_ERROR,
                error.message || 'Failed to update compliance peripheral',
                { statusCode: 500 }
            ));
        }
    };
};

export const buildUpdateCompliancePeripheralVerificationUseCase = ({ complianceRepository, logger }) => {
    return async ({ tenantId, peripheralId, payload = {}, actorUser = null }) => {
        if (!tenantId) {
            return fail(new DomainError(
                DomainErrorCode.TENANT_CONTEXT_MISSING,
                'Tenant context is required',
                { statusCode: 400 }
            ));
        }

        const normalizedPeripheralId = parsePositiveInt(peripheralId);
        if (!normalizedPeripheralId) {
            return fail(new DomainError(
                DomainErrorCode.VALIDATION_FAILED,
                'peripheralId must be a positive integer',
                { statusCode: 422 }
            ));
        }

        const action = String(payload.action || '').trim().toLowerCase();
        if (!['verify', 'reject', 'revoke'].includes(action)) {
            return fail(new DomainError(
                DomainErrorCode.VALIDATION_FAILED,
                'action must be one of: verify, reject, revoke',
                { statusCode: 422 }
            ));
        }

        try {
            assertMasterAdminLevelActor(actorUser);
            const verifierActorType = resolveVerifierActorType(actorUser);
            if (!verifierActorType) {
                return fail(new DomainError(
                    DomainErrorCode.AUTHORIZATION_FAILED,
                    'Verifier actor type is not allowed',
                    { statusCode: 403 }
                ));
            }

            const mutation = buildVerificationMutation({
                action,
                verifiedByActorType: verifierActorType,
                verifiedByUserId: parsePositiveInt(actorUser?.user_id),
                verificationNote: payload.verification_note,
                verificationEvidenceRef: payload.verification_evidence_ref
            });

            if (action === 'verify') mutation.status = 'accredited';
            if (action === 'revoke') mutation.status = 'revoked';

            const updated = await complianceRepository.updatePeripheralById(normalizedPeripheralId, mutation, { lock: true });
            if (!updated || updated.tenant_id !== tenantId) {
                return fail(new DomainError(
                    DomainErrorCode.RESOURCE_NOT_FOUND,
                    'Compliance peripheral not found',
                    { statusCode: 404 }
                ));
            }

            await persistAuditLogWithFallback({
                complianceRepository,
                logger,
                auditPayload: {
                    tenant_id: tenantId,
                    event_type: 'preflight_evaluation',
                    operation: 'compliance.peripherals.verification',
                    decision: COMPLIANCE_DECISION.ALLOW,
                    reason_code: COMPLIANCE_REASON_CODE.ALLOWED,
                    actor_user_id: parsePositiveInt(actorUser?.user_id),
                    metadata: {
                        peripheral_id: normalizedPeripheralId,
                        action,
                        verification_status: updated.verification_status,
                        verifier_actor_type: verifierActorType
                    }
                },
                fallbackContext: {
                    path: 'buildUpdateCompliancePeripheralVerificationUseCase',
                    stage: 'peripheral_verification'
                }
            });

            return ok(updated);
        } catch (error) {
            return failWithDomainOrInternal(error, 'Failed to update compliance peripheral verification');
        }
    };
};

export const buildListFinalReviewDocumentsUseCase = ({ complianceRepository }) => {
    return async ({ tenantId }) => {
        if (!tenantId) {
            return fail(new DomainError(
                DomainErrorCode.TENANT_CONTEXT_MISSING,
                'Tenant context is required',
                { statusCode: 400 }
            ));
        }

        try {
            const [documents, signoff] = await Promise.all([
                complianceRepository.listFinalReviewDocumentsByTenantId(tenantId),
                complianceRepository.getFinalReviewSignoffByTenantId(tenantId)
            ]);
            return ok({ documents, signoff });
        } catch (error) {
            return fail(new DomainError(
                DomainErrorCode.INTERNAL_ERROR,
                error.message || 'Failed to list final review documents',
                { statusCode: 500 }
            ));
        }
    };
};

export const buildUpsertFinalReviewDocumentUseCase = ({ complianceRepository, logger }) => {
    return async ({ tenantId, payload = {}, actorUser = null }) => {
        if (!tenantId) {
            return fail(new DomainError(
                DomainErrorCode.TENANT_CONTEXT_MISSING,
                'Tenant context is required',
                { statusCode: 400 }
            ));
        }

        const requirementCode = String(payload.requirement_code || '').trim();
        const requirement = getFinalReviewRequirement(requirementCode);
        if (!requirement) {
            return fail(new DomainError(
                DomainErrorCode.VALIDATION_FAILED,
                'Unsupported requirement_code',
                { statusCode: 422 }
            ));
        }

        const sourceType = String(payload.source_type || '').trim();
        if (!['external_url', 'upload'].includes(sourceType)) {
            return fail(new DomainError(
                DomainErrorCode.VALIDATION_FAILED,
                'source_type must be upload or external_url',
                { statusCode: 422 }
            ));
        }

        const evidenceMaxAgeDays = Number.parseInt(process.env.COMPLIANCE_EVIDENCE_MAX_AGE_DAYS || '45', 10) || 45;
        const freshnessDate = normalizeDateValue(payload.freshness_date);
        let isValid = true;
        const qualityIssues = [];

        if (sourceType === 'external_url') {
            const externalUrl = String(payload.external_url || '').trim();
            if (!/^https?:\/\//i.test(externalUrl)) {
                isValid = false;
                qualityIssues.push('external_url_invalid');
            }
            if (requirement.requiresFreshness) {
                const ageDays = freshnessDate ? Math.floor((Date.now() - new Date(freshnessDate).getTime()) / (24 * 60 * 60 * 1000)) : null;
                if (!freshnessDate || !Number.isFinite(ageDays)) {
                    isValid = false;
                    qualityIssues.push('invalid_freshness_date');
                } else if (ageDays > evidenceMaxAgeDays) {
                    isValid = false;
                    qualityIssues.push(`stale:${ageDays}d`);
                }
            }
        }

        try {
            assertMasterAdminLevelActor(actorUser);
            const updated = await complianceRepository.upsertFinalReviewDocument(tenantId, requirementCode, {
                source_type: sourceType,
                external_url: sourceType === 'external_url' ? String(payload.external_url || '').trim() : null,
                freshness_date: freshnessDate,
                status: isValid ? 'auto_valid' : 'invalid',
                review_state: 'pending_review',
                review_note: null,
                reviewed_by_actor_type: null,
                reviewed_by_user_id: null,
                reviewed_at: null,
                parsed_metadata: {
                    quality_issues: qualityIssues
                }
            }, { lock: true });

            await persistAuditLogWithFallback({
                complianceRepository,
                logger,
                auditPayload: {
                    tenant_id: tenantId,
                    event_type: 'preflight_evaluation',
                    operation: 'compliance.final_review.upsert_document',
                    decision: COMPLIANCE_DECISION.ALLOW,
                    reason_code: COMPLIANCE_REASON_CODE.ALLOWED,
                    actor_user_id: parsePositiveInt(actorUser?.user_id),
                    metadata: {
                        requirement_code: requirementCode,
                        source_type: sourceType,
                        status: updated.status
                    }
                },
                fallbackContext: {
                    path: 'buildUpsertFinalReviewDocumentUseCase',
                    stage: 'final_review_document_upsert'
                }
            });

            return ok(updated);
        } catch (error) {
            return failWithDomainOrInternal(error, 'Failed to update final review document');
        }
    };
};

export const buildUploadFinalReviewDocumentUseCase = ({ complianceRepository, logger }) => {
    return async ({ tenantId, documentId, file = null, actorUser = null }) => {
        if (!tenantId) {
            return fail(new DomainError(
                DomainErrorCode.TENANT_CONTEXT_MISSING,
                'Tenant context is required',
                { statusCode: 400 }
            ));
        }

        const normalizedDocumentId = parsePositiveInt(documentId);
        if (!normalizedDocumentId) {
            return fail(new DomainError(
                DomainErrorCode.VALIDATION_FAILED,
                'documentId must be a positive integer',
                { statusCode: 422 }
            ));
        }
        if (!file) {
            return fail(new DomainError(
                DomainErrorCode.VALIDATION_FAILED,
                'file is required',
                { statusCode: 422 }
            ));
        }

        try {
            assertMasterAdminLevelActor(actorUser);
            const existing = await complianceRepository.getFinalReviewDocumentById(normalizedDocumentId, { lock: true });
            if (!existing || existing.tenant_id !== tenantId) {
                return fail(new DomainError(
                    DomainErrorCode.RESOURCE_NOT_FOUND,
                    'Final review document not found',
                    { statusCode: 404 }
                ));
            }

            const stored = await complianceRepository.storeFinalReviewUpload({
                tenantId,
                requirementCode: existing.requirement_code,
                file
            });
            if (!stored) {
                return fail(new DomainError(
                    DomainErrorCode.VALIDATION_FAILED,
                    'Unable to process uploaded file',
                    { statusCode: 422 }
                ));
            }

            const updated = await complianceRepository.updateFinalReviewDocumentById(normalizedDocumentId, {
                source_type: 'upload',
                external_url: null,
                ...stored,
                status: 'auto_valid',
                review_state: 'pending_review',
                review_note: null,
                reviewed_by_actor_type: null,
                reviewed_by_user_id: null,
                reviewed_at: null
            }, { lock: true });

            await persistAuditLogWithFallback({
                complianceRepository,
                logger,
                auditPayload: {
                    tenant_id: tenantId,
                    event_type: 'preflight_evaluation',
                    operation: 'compliance.final_review.upload_document',
                    decision: COMPLIANCE_DECISION.ALLOW,
                    reason_code: COMPLIANCE_REASON_CODE.ALLOWED,
                    actor_user_id: parsePositiveInt(actorUser?.user_id),
                    metadata: {
                        document_id: normalizedDocumentId,
                        requirement_code: existing.requirement_code,
                        file_name: updated.file_name
                    }
                },
                fallbackContext: {
                    path: 'buildUploadFinalReviewDocumentUseCase',
                    stage: 'final_review_document_upload'
                }
            });

            return ok(updated);
        } catch (error) {
            return failWithDomainOrInternal(error, 'Failed to upload final review document');
        }
    };
};

export const buildReviewFinalReviewDocumentUseCase = ({ complianceRepository, logger }) => {
    return async ({ tenantId, documentId, payload = {}, actorUser = null }) => {
        if (!tenantId) {
            return fail(new DomainError(
                DomainErrorCode.TENANT_CONTEXT_MISSING,
                'Tenant context is required',
                { statusCode: 400 }
            ));
        }
        const normalizedDocumentId = parsePositiveInt(documentId);
        if (!normalizedDocumentId) {
            return fail(new DomainError(
                DomainErrorCode.VALIDATION_FAILED,
                'documentId must be a positive integer',
                { statusCode: 422 }
            ));
        }

        const action = String(payload.action || '').trim().toLowerCase();
        if (!['note_review', 'revoke', 'restore_valid'].includes(action)) {
            return fail(new DomainError(
                DomainErrorCode.VALIDATION_FAILED,
                'action must be one of: note_review, revoke, restore_valid',
                { statusCode: 422 }
            ));
        }

        try {
            if (!isPlatformAdminActor(actorUser)) {
                return fail(new DomainError(
                    DomainErrorCode.AUTHORIZATION_FAILED,
                    'Platform admin access is required for documentary review actions',
                    { statusCode: 403 }
                ));
            }

            const existing = await complianceRepository.getFinalReviewDocumentById(normalizedDocumentId, { lock: true });
            if (!existing || existing.tenant_id !== tenantId) {
                return fail(new DomainError(
                    DomainErrorCode.RESOURCE_NOT_FOUND,
                    'Final review document not found',
                    { statusCode: 404 }
                ));
            }

            const nextPayload = {
                review_note: payload.review_note || null,
                reviewed_by_actor_type: 'platform_admin',
                reviewed_by_user_id: parsePositiveInt(actorUser?.user_id),
                reviewed_at: new Date()
            };
            if (action === 'note_review') {
                nextPayload.review_state = 'review_noted';
            } else if (action === 'revoke') {
                nextPayload.review_state = 'revoked';
                nextPayload.status = 'revoked';
            } else {
                nextPayload.review_state = 'review_noted';
                nextPayload.status = 'auto_valid';
            }

            const updated = await complianceRepository.updateFinalReviewDocumentById(normalizedDocumentId, nextPayload, { lock: true });

            await persistAuditLogWithFallback({
                complianceRepository,
                logger,
                auditPayload: {
                    tenant_id: tenantId,
                    event_type: 'preflight_evaluation',
                    operation: 'compliance.final_review.review_document',
                    decision: COMPLIANCE_DECISION.ALLOW,
                    reason_code: COMPLIANCE_REASON_CODE.ALLOWED,
                    actor_user_id: parsePositiveInt(actorUser?.user_id),
                    metadata: {
                        document_id: normalizedDocumentId,
                        requirement_code: existing.requirement_code,
                        action
                    }
                },
                fallbackContext: {
                    path: 'buildReviewFinalReviewDocumentUseCase',
                    stage: 'final_review_document_review'
                }
            });

            return ok(updated);
        } catch (error) {
            return failWithDomainOrInternal(error, 'Failed to review final review document');
        }
    };
};

export const buildUpsertFinalReviewSignoffUseCase = ({ complianceRepository, logger }) => {
    return async ({ tenantId, payload = {}, actorUser = null }) => {
        if (!tenantId) {
            return fail(new DomainError(
                DomainErrorCode.TENANT_CONTEXT_MISSING,
                'Tenant context is required',
                { statusCode: 400 }
            ));
        }

        try {
            assertMasterAdminLevelActor(actorUser);
            const updated = await complianceRepository.upsertFinalReviewSignoffByTenantId(tenantId, {
                engineering_approver: String(payload.engineering_approver || '').trim() || null,
                compliance_approver: String(payload.compliance_approver || '').trim() || null,
                filing_batch_id: String(payload.filing_batch_id || '').trim() || null,
                engineering_signed_at: normalizeDateValue(payload.engineering_signed_at),
                compliance_signed_at: normalizeDateValue(payload.compliance_signed_at)
            }, { lock: true });

            await persistAuditLogWithFallback({
                complianceRepository,
                logger,
                auditPayload: {
                    tenant_id: tenantId,
                    event_type: 'preflight_evaluation',
                    operation: 'compliance.final_review.upsert_signoff',
                    decision: COMPLIANCE_DECISION.ALLOW,
                    reason_code: COMPLIANCE_REASON_CODE.ALLOWED,
                    actor_user_id: parsePositiveInt(actorUser?.user_id),
                    metadata: {
                        has_engineering_approver: Boolean(updated.engineering_approver),
                        has_compliance_approver: Boolean(updated.compliance_approver),
                        has_filing_batch_id: Boolean(updated.filing_batch_id)
                    }
                },
                fallbackContext: {
                    path: 'buildUpsertFinalReviewSignoffUseCase',
                    stage: 'final_review_signoff_upsert'
                }
            });

            return ok(updated);
        } catch (error) {
            return failWithDomainOrInternal(error, 'Failed to update final review signoff metadata');
        }
    };
};

export const buildListComplianceAuditLogsUseCase = ({ complianceRepository }) => {
    return async ({ tenantId, limit = 100 }) => {
        if (!tenantId) {
            return fail(new DomainError(
                DomainErrorCode.TENANT_CONTEXT_MISSING,
                'Tenant context is required',
                { statusCode: 400 }
            ));
        }

        try {
            const logs = await complianceRepository.listAuditLogsByTenantId(tenantId, { limit });
            return ok({ logs });
        } catch (error) {
            return fail(new DomainError(
                DomainErrorCode.INTERNAL_ERROR,
                error.message || 'Failed to list compliance audit logs',
                { statusCode: 500 }
            ));
        }
    };
};

export const buildRecordComplianceSecuritySignalUseCase = ({ complianceRepository, logger }) => {
    return async ({ tenantId, signalCode, severity = 'warning', metadata = {}, actorUser = null }) => {
        if (!tenantId) {
            return fail(new DomainError(
                DomainErrorCode.TENANT_CONTEXT_MISSING,
                'Tenant context is required',
                { statusCode: 400 }
            ));
        }

        const normalizedSignalCode = String(signalCode || '').trim().toLowerCase();
        if (!normalizedSignalCode) {
            return fail(new DomainError(
                DomainErrorCode.VALIDATION_FAILED,
                'signalCode is required',
                { statusCode: 422 }
            ));
        }

        const normalizedSeverity = normalizeSecuritySeverity(severity);
        const metadataPayload = metadata && typeof metadata === 'object' ? metadata : {};
        const incidentId = String(metadataPayload.incident_id || '').trim()
            || buildSecurityIncidentId({
                signalCode: normalizedSignalCode,
                createdAt: Date.now()
            });
        const incidentStatus = normalizeSecurityIncidentStatus(metadataPayload.incident_status || SECURITY_INCIDENT_STATUS.NEW);

        try {
            const persistence = await persistAuditLogWithFallback({
                complianceRepository,
                logger,
                auditPayload: {
                    tenant_id: tenantId,
                    event_type: SECURITY_SIGNAL_EVENT_TYPE,
                    operation: `security.${normalizedSignalCode}`,
                    decision: COMPLIANCE_DECISION.ALLOW,
                    reason_code: normalizedSignalCode.toUpperCase(),
                    actor_user_id: parsePositiveInt(actorUser?.user_id),
                    metadata: {
                        incident_id: incidentId,
                        incident_status: incidentStatus,
                        signal_code: normalizedSignalCode,
                        severity: normalizedSeverity,
                        ...metadataPayload
                    }
                },
                fallbackContext: {
                    path: 'buildRecordComplianceSecuritySignalUseCase',
                    stage: 'security_signal'
                }
            });

            const dispatchAttempt = await recordIncidentDispatchAttempt({
                complianceRepository,
                logger,
                tenantId,
                incidentId,
                incidentStatus,
                signalCode: normalizedSignalCode,
                severity: normalizedSeverity,
                actorUserId: actorUser?.user_id,
                triggerEvent: `security.${normalizedSignalCode}`
            });

            return ok({
                recorded: true,
                signal_code: normalizedSignalCode,
                severity: normalizedSeverity,
                incident_id: incidentId,
                incident_status: incidentStatus,
                audit_persistence: persistence.persisted,
                dispatch_attempt: dispatchAttempt
            });
        } catch (error) {
            return failWithDomainOrInternal(error, 'Failed to record compliance security signal');
        }
    };
};

export const buildListComplianceSecurityIncidentsUseCase = ({ complianceRepository }) => {
    return async ({ tenantId, limit = 200 }) => {
        if (!tenantId) {
            return fail(new DomainError(
                DomainErrorCode.TENANT_CONTEXT_MISSING,
                'Tenant context is required',
                { statusCode: 400 }
            ));
        }

        try {
            const logs = await complianceRepository.listAuditLogsByTenantId(tenantId, { limit: Math.min(Number(limit) || 200, 500) });
            const summary = summarizeSecurityIncidents(logs);
            return ok(summary);
        } catch (error) {
            return failWithDomainOrInternal(error, 'Failed to list compliance security incidents');
        }
    };
};

export const buildUpdateComplianceSecurityIncidentStatusUseCase = ({
    complianceRepository,
    listComplianceSecurityIncidentsUseCase,
    logger
}) => {
    return async ({
        tenantId,
        incidentId,
        status,
        actorUser = null,
        note = null,
        evidenceRef = null
    }) => {
        if (!tenantId) {
            return fail(new DomainError(
                DomainErrorCode.TENANT_CONTEXT_MISSING,
                'Tenant context is required',
                { statusCode: 400 }
            ));
        }

        const normalizedIncidentId = String(incidentId || '').trim();
        if (!normalizedIncidentId) {
            return fail(new DomainError(
                DomainErrorCode.VALIDATION_FAILED,
                'incidentId is required',
                { statusCode: 422 }
            ));
        }

        const normalizedStatus = normalizeSecurityIncidentStatus(status);
        if (![SECURITY_INCIDENT_STATUS.ACKNOWLEDGED, SECURITY_INCIDENT_STATUS.RESOLVED].includes(normalizedStatus)) {
            return fail(new DomainError(
                DomainErrorCode.VALIDATION_FAILED,
                'status must be acknowledged or resolved',
                { statusCode: 422 }
            ));
        }

        try {
            assertMasterAdminLevelActor(actorUser);
            const listResult = await listComplianceSecurityIncidentsUseCase({ tenantId, limit: 500 });
            if (!listResult.success) {
                return listResult;
            }

            const incident = (listResult.data?.incidents || []).find(
                (entry) => String(entry?.incident_id || '') === normalizedIncidentId
            );
            if (!incident) {
                return fail(new DomainError(
                    DomainErrorCode.RESOURCE_NOT_FOUND,
                    'Security incident not found',
                    { statusCode: 404 }
                ));
            }

            const previousStatus = normalizeSecurityIncidentStatus(incident.status);
            if (previousStatus === normalizedStatus) {
                return ok({
                    ...incident,
                    status: normalizedStatus,
                    unchanged: true
                });
            }

            if (previousStatus === SECURITY_INCIDENT_STATUS.RESOLVED && normalizedStatus !== SECURITY_INCIDENT_STATUS.RESOLVED) {
                return fail(new DomainError(
                    DomainErrorCode.CONFLICT,
                    'Resolved security incidents cannot transition back to active states',
                    { statusCode: 409 }
                ));
            }

            const normalizedNote = String(note || '').trim() || null;
            const normalizedEvidenceRef = String(evidenceRef || '').trim() || null;

            await persistAuditLogWithFallback({
                complianceRepository,
                logger,
                auditPayload: {
                    tenant_id: tenantId,
                    event_type: SECURITY_SIGNAL_EVENT_TYPE,
                    operation: `security.incident_${normalizedStatus}`,
                    decision: COMPLIANCE_DECISION.ALLOW,
                    reason_code: `SECURITY_INCIDENT_${normalizedStatus.toUpperCase()}`,
                    actor_user_id: parsePositiveInt(actorUser?.user_id),
                    metadata: {
                        incident_id: normalizedIncidentId,
                        incident_status: normalizedStatus,
                        previous_status: previousStatus,
                        signal_code: incident.signal_code || null,
                        severity: normalizeSecuritySeverity(incident.severity),
                        note: normalizedNote,
                        evidence_ref: normalizedEvidenceRef
                    }
                },
                fallbackContext: {
                    path: 'buildUpdateComplianceSecurityIncidentStatusUseCase',
                    stage: 'security_incident_status_update'
                }
            });

            const dispatchAttempt = await recordIncidentDispatchAttempt({
                complianceRepository,
                logger,
                tenantId,
                incidentId: normalizedIncidentId,
                incidentStatus: normalizedStatus,
                signalCode: incident.signal_code || 'security_signal',
                severity: incident.severity,
                actorUserId: actorUser?.user_id,
                triggerEvent: `security.incident_${normalizedStatus}`
            });

            return ok({
                ...incident,
                status: normalizedStatus,
                updated_at: new Date().toISOString(),
                latest_note: normalizedNote || incident.latest_note || null,
                latest_evidence_ref: normalizedEvidenceRef || incident.latest_evidence_ref || null,
                dispatch: {
                    channel: dispatchAttempt.channel,
                    delivery_status: dispatchAttempt.delivery_status,
                    attempted_at: dispatchAttempt.attempted_at,
                    error: dispatchAttempt.error,
                    target_configured: dispatchAttempt.target_configured === true,
                    dispatch_reference: dispatchAttempt.dispatch_reference || null
                },
                dispatch_attempt_append_result: dispatchAttempt.audit_persistence,
                unchanged: false
            });
        } catch (error) {
            return failWithDomainOrInternal(error, 'Failed to update compliance security incident status');
        }
    };
};

export const buildCompliancePreflightUseCase = ({
    evaluateComplianceOperationUseCase
}) => {
    return async ({ tenantId, payload = {}, actorUser = null }) => {
        if (!tenantId) {
            return fail(new DomainError(
                DomainErrorCode.TENANT_CONTEXT_MISSING,
                'Tenant context is required',
                { statusCode: 400 }
            ));
        }

        const surfaces = Array.isArray(payload.surfaces) ? payload.surfaces : [];
        const surfaceToOperations = {
            pos: [COMPLIANCE_OPERATION.POS_CHECKOUT, COMPLIANCE_OPERATION.RECEIPT_RENDER],
            terminal: [COMPLIANCE_OPERATION.POS_TERMINAL_OPERATION],
            settings: [COMPLIANCE_OPERATION.SETTINGS_UPDATE],
            payments: [COMPLIANCE_OPERATION.PAYMENT_CAPABILITY_ENABLE],
            compliance: [COMPLIANCE_OPERATION.REQUEST_PREFLIGHT]
        };

        const operations = [
            ...new Set(
                surfaces.flatMap((surface) => surfaceToOperations[String(surface || '').trim().toLowerCase()] || [])
            )
        ];

        if (operations.length === 0) {
            operations.push(COMPLIANCE_OPERATION.REQUEST_PREFLIGHT);
        }

        try {
            const declaration = payload.impact_declaration || {};
            const impactDeclarationPresent = Boolean(payload.impact_declaration && payload.impact_declaration.classification);
            const declaredSurfaces = Array.isArray(declaration.affected_surfaces)
                ? declaration.affected_surfaces.map((value) => String(value || '').trim().toLowerCase()).filter(Boolean)
                : [];
            const requestedSurfaces = surfaces.map((value) => String(value || '').trim().toLowerCase()).filter(Boolean);
            if (impactDeclarationPresent && requestedSurfaces.length > 0) {
                const missingSurface = requestedSurfaces.find((surface) => !declaredSurfaces.includes(surface));
                if (missingSurface) {
                    return fail(new DomainError(
                        DomainErrorCode.VALIDATION_FAILED,
                        `impact_declaration.affected_surfaces must include requested surface: ${missingSurface}`,
                        { statusCode: 422 }
                    ));
                }
            }

            const decisions = [];
            for (const operation of operations) {
                const evaluated = await evaluateComplianceOperationUseCase({
                    tenantId,
                    operation,
                    context: {
                        setting_keys: payload.setting_keys,
                        setting_updates: payload.setting_updates,
                        requested_document_type: payload.requested_document_type,
                        requested_document_context: payload.requested_document_context,
                        terminal_id: payload.terminal_id
                    }
                });
                if (evaluated.success) {
                    decisions.push(evaluated.data.decision);
                } else {
                    return evaluated;
                }
            }

            const preflight = buildPreflightResult({
                decisions,
                impactDeclarationPresent
            });

            return ok({
                ...preflight,
                declaration_id: declaration.declaration_id || null,
                actor: normalizeActorIdentity(actorUser)
            });
        } catch (error) {
            return fail(new DomainError(
                DomainErrorCode.INTERNAL_ERROR,
                error.message || 'Compliance preflight failed',
                { statusCode: 500 }
            ));
        }
    };
};
