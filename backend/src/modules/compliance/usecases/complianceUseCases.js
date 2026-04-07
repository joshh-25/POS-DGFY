
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

            if (needsStatefulChecks) {
                [artifacts, peripherals] = await Promise.all([
                    complianceRepository.listArtifactsByTenantId(effectiveTenant.id),
                    complianceRepository.listPeripheralsByTenantId(effectiveTenant.id)
                ]);
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
                settings
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

            try {
                await complianceRepository.createAuditLog({
                    tenant_id: effectiveTenant.id,
                    event_type: 'blocked_operation',
                    operation,
                    decision: decision.decision,
                    reason_code: decision.reason_code,
                    actor_user_id: actorUserId,
                    metadata
                });
            } catch (error) {
                logger?.warn?.(`[Compliance] Failed to persist blocked operation audit log: ${error.message}`);
            }

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

            const checklist = evaluateComplianceChecklist({
                tenant,
                complianceProfile: tenant.compliance_profile,
                artifacts,
                peripherals,
                settings
            });

            return ok({
                mode_state: tenant.compliance_mode_state,
                mode_choice_required: tenant.compliance_mode_choice_required === true,
                mode_selected_at: tenant.compliance_mode_selected_at,
                mode_selected_by: tenant.compliance_mode_selected_by,
                activated_at: tenant.compliance_activated_at,
                policy_version: tenant.compliance_policy_version,
                profile: tenant.compliance_profile || {},
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

export const buildSelectComplianceModeUseCase = ({ complianceRepository }) => {
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
                const updated = await complianceRepository.updateTenantById(tenantId, {
                    compliance_mode_state: nextState,
                    compliance_mode_choice_required: false,
                    compliance_mode_selected_at: new Date(),
                    compliance_mode_selected_by: normalizeActorIdentity(actorUser),
                    compliance_policy_version: '2026.04.07'
                }, {
                    transaction,
                    lock: true
                });

                await complianceRepository.createAuditLog({
                    tenant_id: tenantId,
                    event_type: 'mode_selection',
                    operation: COMPLIANCE_OPERATION.REQUEST_PREFLIGHT,
                    decision: COMPLIANCE_DECISION.ALLOW,
                    reason_code: COMPLIANCE_REASON_CODE.ALLOWED,
                    actor_user_id: parsePositiveInt(actorUser?.user_id),
                    metadata: {
                        mode_choice: normalizedModeChoice,
                        mode_state: nextState
                    }
                }, { transaction });

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

export const buildUpgradeToCompliantUseCase = ({ complianceRepository }) => {
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
                const updated = await complianceRepository.updateTenantById(tenantId, {
                    compliance_mode_state: COMPLIANCE_MODE_STATE.COMPLIANT_PENDING,
                    compliance_mode_selected_at: new Date(),
                    compliance_mode_selected_by: normalizeActorIdentity(actorUser),
                    compliance_policy_version: '2026.04.07'
                }, {
                    transaction,
                    lock: true
                });

                await complianceRepository.createAuditLog({
                    tenant_id: tenantId,
                    event_type: 'mode_upgrade',
                    operation: COMPLIANCE_OPERATION.REQUEST_PREFLIGHT,
                    decision: COMPLIANCE_DECISION.ALLOW,
                    reason_code: COMPLIANCE_REASON_CODE.ALLOWED,
                    actor_user_id: parsePositiveInt(actorUser?.user_id),
                    metadata: {
                        previous_mode_state: tenant.compliance_mode_state,
                        next_mode_state: COMPLIANCE_MODE_STATE.COMPLIANT_PENDING
                    }
                }, { transaction });

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

            const checklist = evaluateComplianceChecklist({
                tenant,
                complianceProfile: tenant.compliance_profile,
                artifacts,
                peripherals,
                settings,
                terminalId
            });

            return ok(checklist);
        } catch (error) {
            return failWithDomainOrInternal(error, 'Failed to build compliance checklist');
        }
    };
};

export const buildActivateCompliantModeUseCase = ({
    complianceRepository,
    getComplianceChecklistUseCase
}) => {
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

                await complianceRepository.createAuditLog({
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
                }, { transaction });

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

export const buildUpdateComplianceProfileUseCase = ({ complianceRepository }) => {
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

            await complianceRepository.createAuditLog({
                tenant_id: tenantId,
                event_type: 'preflight_evaluation',
                operation: COMPLIANCE_OPERATION.REQUEST_PREFLIGHT,
                decision: COMPLIANCE_DECISION.ALLOW,
                reason_code: COMPLIANCE_REASON_CODE.ALLOWED,
                actor_user_id: parsePositiveInt(actorUser?.user_id),
                metadata: {
                    profile_patch_keys: Object.keys(profilePatch)
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

export const buildCreateComplianceArtifactUseCase = ({ complianceRepository }) => {
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

            await complianceRepository.createAuditLog({
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

export const buildUpdateComplianceArtifactVerificationUseCase = ({ complianceRepository }) => {
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

            await complianceRepository.createAuditLog({
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

export const buildCreateCompliancePeripheralUseCase = ({ complianceRepository }) => {
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

            await complianceRepository.createAuditLog({
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

export const buildUpdateCompliancePeripheralVerificationUseCase = ({ complianceRepository }) => {
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

            await complianceRepository.createAuditLog({
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
            });

            return ok(updated);
        } catch (error) {
            return failWithDomainOrInternal(error, 'Failed to update compliance peripheral verification');
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
            const declaredSurfaces = Array.isArray(declaration.affected_surfaces)
                ? declaration.affected_surfaces.map((value) => String(value || '').trim().toLowerCase()).filter(Boolean)
                : [];
            const requestedSurfaces = surfaces.map((value) => String(value || '').trim().toLowerCase()).filter(Boolean);
            if (requestedSurfaces.length > 0) {
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
                        terminal_id: payload.terminal_id
                    }
                });
                if (evaluated.success) {
                    decisions.push(evaluated.data.decision);
                } else {
                    return evaluated;
                }
            }

            const impactDeclarationPresent = Boolean(payload.impact_declaration && payload.impact_declaration.classification);
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
