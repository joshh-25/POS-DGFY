import {
    getComplianceProfileUseCase,
    selectComplianceModeUseCase,
    upgradeToCompliantUseCase,
    revertToNonCompliantModeUseCase,
    getComplianceChecklistUseCase,
    activateCompliantModeUseCase,
    updateComplianceProfileUseCase,
    listComplianceArtifactsUseCase,
    createComplianceArtifactUseCase,
    updateComplianceArtifactUseCase,
    updateComplianceArtifactVerificationUseCase,
    listFinalReviewDocumentsUseCase,
    upsertFinalReviewDocumentUseCase,
    uploadFinalReviewDocumentUseCase,
    reviewFinalReviewDocumentUseCase,
    upsertFinalReviewSignoffUseCase,
    listCompliancePeripheralsUseCase,
    createCompliancePeripheralUseCase,
    updateCompliancePeripheralUseCase,
    updateCompliancePeripheralVerificationUseCase,
    listComplianceAuditLogsUseCase,
    compliancePreflightUseCase
} from '../index.js';
import { sendUseCaseResult } from '../../shared/controllers/useCaseResponder.js';
import { invalidateTenantLookupCache } from '../../../middleware/tenantHandler.js';

const timestamp = () => new Date().toISOString();
const requestId = (req, res) => req.requestId || res.locals?.requestId || null;

const defaultErrorPayload = (req, res, failure) => ({
    success: false,
    data: null,
    message: failure.message,
    error_code: failure.code,
    errors: failure.details,
    request_id: requestId(req, res),
    timestamp: timestamp()
});

const resolveTenantId = (req) => req.tenant?.id || null;
const invalidateTenantCache = (req) => {
    invalidateTenantLookupCache({
        companyToken: req.headers['x-company-token'] || null,
        tenantId: req.tenant?.id || null
    });
};

export const getComplianceProfile = async (req, res, next) => {
    try {
        const result = await getComplianceProfileUseCase({
            tenantId: resolveTenantId(req)
        });
        return sendUseCaseResult(res, result, {
            successStatusCodeResolver: () => 200,
            successPayloadResolver: () => ({
                success: true,
                data: result.data,
                timestamp: timestamp()
            }),
            errorPayloadResolver: (failure) => defaultErrorPayload(req, res, failure)
        });
    } catch (error) {
        next(error);
    }
};

export const selectComplianceMode = async (req, res, next) => {
    try {
        const result = await selectComplianceModeUseCase({
            tenantId: resolveTenantId(req),
            modeChoice: req.validatedData?.mode_choice || req.body?.mode_choice,
            actorUser: req.user
        });
        if (result?.success) {
            invalidateTenantCache(req);
        }

        return sendUseCaseResult(res, result, {
            successStatusCodeResolver: () => 200,
            successPayloadResolver: () => ({
                success: true,
                data: result.data,
                message: 'Compliance mode selected successfully',
                timestamp: timestamp()
            }),
            errorPayloadResolver: (failure) => defaultErrorPayload(req, res, failure)
        });
    } catch (error) {
        next(error);
    }
};

export const upgradeToCompliant = async (req, res, next) => {
    try {
        const result = await upgradeToCompliantUseCase({
            tenantId: resolveTenantId(req),
            actorUser: req.user
        });
        if (result?.success) {
            invalidateTenantCache(req);
        }

        return sendUseCaseResult(res, result, {
            successStatusCodeResolver: () => 200,
            successPayloadResolver: () => ({
                success: true,
                data: result.data,
                message: 'Tenant moved to compliant_pending mode',
                timestamp: timestamp()
            }),
            errorPayloadResolver: (failure) => defaultErrorPayload(req, res, failure)
        });
    } catch (error) {
        next(error);
    }
};

export const revertToNonCompliantMode = async (req, res, next) => {
    try {
        const result = await revertToNonCompliantModeUseCase({
            tenantId: resolveTenantId(req),
            actorUser: req.user,
            reason: req.validatedData?.reason || req.body?.reason,
            context: req.validatedData?.context || req.body?.context || {}
        });
        if (result?.success) {
            invalidateTenantCache(req);
        }

        return sendUseCaseResult(res, result, {
            successStatusCodeResolver: () => 200,
            successPayloadResolver: () => ({
                success: true,
                data: result.data,
                message: 'Tenant reverted to non_compliant_active mode',
                timestamp: timestamp()
            }),
            errorPayloadResolver: (failure) => defaultErrorPayload(req, res, failure)
        });
    } catch (error) {
        next(error);
    }
};

export const getComplianceChecklist = async (req, res, next) => {
    try {
        const result = await getComplianceChecklistUseCase({
            tenantId: resolveTenantId(req),
            terminalId: req.validatedQuery?.terminal_id || req.query?.terminal_id || null
        });

        return sendUseCaseResult(res, result, {
            successStatusCodeResolver: () => 200,
            successPayloadResolver: () => ({
                success: true,
                data: result.data,
                timestamp: timestamp()
            }),
            errorPayloadResolver: (failure) => defaultErrorPayload(req, res, failure)
        });
    } catch (error) {
        next(error);
    }
};

export const activateCompliantMode = async (req, res, next) => {
    try {
        const result = await activateCompliantModeUseCase({
            tenantId: resolveTenantId(req),
            actorUser: req.user,
            confirmationText: req.validatedData?.confirmation_text || req.body?.confirmation_text || ''
        });
        if (result?.success) {
            invalidateTenantCache(req);
        }

        return sendUseCaseResult(res, result, {
            successStatusCodeResolver: () => 200,
            successPayloadResolver: () => ({
                success: true,
                data: result.data,
                message: 'Compliant mode activated',
                timestamp: timestamp()
            }),
            errorPayloadResolver: (failure) => defaultErrorPayload(req, res, failure)
        });
    } catch (error) {
        next(error);
    }
};

export const updateComplianceProfile = async (req, res, next) => {
    try {
        const result = await updateComplianceProfileUseCase({
            tenantId: resolveTenantId(req),
            profilePatch: req.validatedData || req.body,
            actorUser: req.user
        });
        if (result?.success) {
            invalidateTenantCache(req);
        }

        return sendUseCaseResult(res, result, {
            successStatusCodeResolver: () => 200,
            successPayloadResolver: () => ({
                success: true,
                data: result.data,
                message: 'Compliance profile updated',
                timestamp: timestamp()
            }),
            errorPayloadResolver: (failure) => defaultErrorPayload(req, res, failure)
        });
    } catch (error) {
        next(error);
    }
};

export const listComplianceArtifacts = async (req, res, next) => {
    try {
        const result = await listComplianceArtifactsUseCase({
            tenantId: resolveTenantId(req)
        });

        return sendUseCaseResult(res, result, {
            successStatusCodeResolver: () => 200,
            successPayloadResolver: () => ({
                success: true,
                data: result.data,
                timestamp: timestamp()
            }),
            errorPayloadResolver: (failure) => defaultErrorPayload(req, res, failure)
        });
    } catch (error) {
        next(error);
    }
};

export const createComplianceArtifact = async (req, res, next) => {
    try {
        const result = await createComplianceArtifactUseCase({
            tenantId: resolveTenantId(req),
            payload: req.validatedData || req.body,
            actorUser: req.user
        });
        if (result?.success) {
            invalidateTenantCache(req);
        }

        return sendUseCaseResult(res, result, {
            successStatusCodeResolver: () => 201,
            successPayloadResolver: () => ({
                success: true,
                data: result.data,
                message: 'Compliance artifact created',
                timestamp: timestamp()
            }),
            errorPayloadResolver: (failure) => defaultErrorPayload(req, res, failure)
        });
    } catch (error) {
        next(error);
    }
};

export const updateComplianceArtifact = async (req, res, next) => {
    try {
        const result = await updateComplianceArtifactUseCase({
            tenantId: resolveTenantId(req),
            artifactId: req.validatedParams?.artifact_id || req.params?.artifact_id,
            payload: req.validatedData || req.body
        });
        if (result?.success) {
            invalidateTenantCache(req);
        }

        return sendUseCaseResult(res, result, {
            successStatusCodeResolver: () => 200,
            successPayloadResolver: () => ({
                success: true,
                data: result.data,
                message: 'Compliance artifact updated',
                timestamp: timestamp()
            }),
            errorPayloadResolver: (failure) => defaultErrorPayload(req, res, failure)
        });
    } catch (error) {
        next(error);
    }
};

export const updateComplianceArtifactVerification = async (req, res, next) => {
    try {
        const result = await updateComplianceArtifactVerificationUseCase({
            tenantId: resolveTenantId(req),
            artifactId: req.validatedParams?.artifact_id || req.params?.artifact_id,
            payload: req.validatedData || req.body,
            actorUser: req.user
        });
        if (result?.success) {
            invalidateTenantCache(req);
        }

        return sendUseCaseResult(res, result, {
            successStatusCodeResolver: () => 200,
            successPayloadResolver: () => ({
                success: true,
                data: result.data,
                message: 'Compliance artifact verification updated',
                timestamp: timestamp()
            }),
            errorPayloadResolver: (failure) => defaultErrorPayload(req, res, failure)
        });
    } catch (error) {
        next(error);
    }
};

export const listFinalReviewDocuments = async (req, res, next) => {
    try {
        const result = await listFinalReviewDocumentsUseCase({
            tenantId: resolveTenantId(req)
        });

        return sendUseCaseResult(res, result, {
            successStatusCodeResolver: () => 200,
            successPayloadResolver: () => ({
                success: true,
                data: result.data,
                timestamp: timestamp()
            }),
            errorPayloadResolver: (failure) => defaultErrorPayload(req, res, failure)
        });
    } catch (error) {
        next(error);
    }
};

export const upsertFinalReviewDocument = async (req, res, next) => {
    try {
        const result = await upsertFinalReviewDocumentUseCase({
            tenantId: resolveTenantId(req),
            payload: req.validatedData || req.body,
            actorUser: req.user
        });
        if (result?.success) {
            invalidateTenantCache(req);
        }

        return sendUseCaseResult(res, result, {
            successStatusCodeResolver: () => 200,
            successPayloadResolver: () => ({
                success: true,
                data: result.data,
                message: 'Final review document updated',
                timestamp: timestamp()
            }),
            errorPayloadResolver: (failure) => defaultErrorPayload(req, res, failure)
        });
    } catch (error) {
        next(error);
    }
};

export const uploadFinalReviewDocument = async (req, res, next) => {
    try {
        const result = await uploadFinalReviewDocumentUseCase({
            tenantId: resolveTenantId(req),
            documentId: req.validatedParams?.document_id || req.params?.document_id,
            file: req.file || null,
            actorUser: req.user
        });
        if (result?.success) {
            invalidateTenantCache(req);
        }

        return sendUseCaseResult(res, result, {
            successStatusCodeResolver: () => 200,
            successPayloadResolver: () => ({
                success: true,
                data: result.data,
                message: 'Final review document uploaded',
                timestamp: timestamp()
            }),
            errorPayloadResolver: (failure) => defaultErrorPayload(req, res, failure)
        });
    } catch (error) {
        next(error);
    }
};

export const reviewFinalReviewDocument = async (req, res, next) => {
    try {
        const result = await reviewFinalReviewDocumentUseCase({
            tenantId: resolveTenantId(req),
            documentId: req.validatedParams?.document_id || req.params?.document_id,
            payload: req.validatedData || req.body,
            actorUser: req.user
        });
        if (result?.success) {
            invalidateTenantCache(req);
        }

        return sendUseCaseResult(res, result, {
            successStatusCodeResolver: () => 200,
            successPayloadResolver: () => ({
                success: true,
                data: result.data,
                message: 'Final review document review updated',
                timestamp: timestamp()
            }),
            errorPayloadResolver: (failure) => defaultErrorPayload(req, res, failure)
        });
    } catch (error) {
        next(error);
    }
};

export const upsertFinalReviewSignoff = async (req, res, next) => {
    try {
        const result = await upsertFinalReviewSignoffUseCase({
            tenantId: resolveTenantId(req),
            payload: req.validatedData || req.body,
            actorUser: req.user
        });
        if (result?.success) {
            invalidateTenantCache(req);
        }

        return sendUseCaseResult(res, result, {
            successStatusCodeResolver: () => 200,
            successPayloadResolver: () => ({
                success: true,
                data: result.data,
                message: 'Final review sign-off metadata updated',
                timestamp: timestamp()
            }),
            errorPayloadResolver: (failure) => defaultErrorPayload(req, res, failure)
        });
    } catch (error) {
        next(error);
    }
};

export const listCompliancePeripherals = async (req, res, next) => {
    try {
        const result = await listCompliancePeripheralsUseCase({
            tenantId: resolveTenantId(req)
        });

        return sendUseCaseResult(res, result, {
            successStatusCodeResolver: () => 200,
            successPayloadResolver: () => ({
                success: true,
                data: result.data,
                timestamp: timestamp()
            }),
            errorPayloadResolver: (failure) => defaultErrorPayload(req, res, failure)
        });
    } catch (error) {
        next(error);
    }
};

export const createCompliancePeripheral = async (req, res, next) => {
    try {
        const result = await createCompliancePeripheralUseCase({
            tenantId: resolveTenantId(req),
            payload: req.validatedData || req.body,
            actorUser: req.user
        });
        if (result?.success) {
            invalidateTenantCache(req);
        }

        return sendUseCaseResult(res, result, {
            successStatusCodeResolver: () => 201,
            successPayloadResolver: () => ({
                success: true,
                data: result.data,
                message: 'Compliance peripheral created',
                timestamp: timestamp()
            }),
            errorPayloadResolver: (failure) => defaultErrorPayload(req, res, failure)
        });
    } catch (error) {
        next(error);
    }
};

export const updateCompliancePeripheral = async (req, res, next) => {
    try {
        const result = await updateCompliancePeripheralUseCase({
            tenantId: resolveTenantId(req),
            peripheralId: req.validatedParams?.peripheral_id || req.params?.peripheral_id,
            payload: req.validatedData || req.body
        });
        if (result?.success) {
            invalidateTenantCache(req);
        }

        return sendUseCaseResult(res, result, {
            successStatusCodeResolver: () => 200,
            successPayloadResolver: () => ({
                success: true,
                data: result.data,
                message: 'Compliance peripheral updated',
                timestamp: timestamp()
            }),
            errorPayloadResolver: (failure) => defaultErrorPayload(req, res, failure)
        });
    } catch (error) {
        next(error);
    }
};

export const updateCompliancePeripheralVerification = async (req, res, next) => {
    try {
        const result = await updateCompliancePeripheralVerificationUseCase({
            tenantId: resolveTenantId(req),
            peripheralId: req.validatedParams?.peripheral_id || req.params?.peripheral_id,
            payload: req.validatedData || req.body,
            actorUser: req.user
        });
        if (result?.success) {
            invalidateTenantCache(req);
        }

        return sendUseCaseResult(res, result, {
            successStatusCodeResolver: () => 200,
            successPayloadResolver: () => ({
                success: true,
                data: result.data,
                message: 'Compliance peripheral verification updated',
                timestamp: timestamp()
            }),
            errorPayloadResolver: (failure) => defaultErrorPayload(req, res, failure)
        });
    } catch (error) {
        next(error);
    }
};

export const listComplianceAuditLogs = async (req, res, next) => {
    try {
        const result = await listComplianceAuditLogsUseCase({
            tenantId: resolveTenantId(req),
            limit: req.validatedQuery?.limit || req.query?.limit
        });

        return sendUseCaseResult(res, result, {
            successStatusCodeResolver: () => 200,
            successPayloadResolver: () => ({
                success: true,
                data: result.data,
                timestamp: timestamp()
            }),
            errorPayloadResolver: (failure) => defaultErrorPayload(req, res, failure)
        });
    } catch (error) {
        next(error);
    }
};

export const runCompliancePreflight = async (req, res, next) => {
    try {
        const result = await compliancePreflightUseCase({
            tenantId: resolveTenantId(req),
            payload: req.validatedData || req.body,
            actorUser: req.user
        });

        return sendUseCaseResult(res, result, {
            successStatusCodeResolver: () => 200,
            successPayloadResolver: () => ({
                success: true,
                data: result.data,
                message: result.data.can_proceed
                    ? 'Compliance preflight passed'
                    : 'Compliance preflight failed',
                timestamp: timestamp()
            }),
            errorPayloadResolver: (failure) => defaultErrorPayload(req, res, failure)
        });
    } catch (error) {
        next(error);
    }
};

export default {
    getComplianceProfile,
    selectComplianceMode,
    upgradeToCompliant,
    revertToNonCompliantMode,
    getComplianceChecklist,
    activateCompliantMode,
    updateComplianceProfile,
    listComplianceArtifacts,
    createComplianceArtifact,
    updateComplianceArtifact,
    updateComplianceArtifactVerification,
    listFinalReviewDocuments,
    upsertFinalReviewDocument,
    uploadFinalReviewDocument,
    reviewFinalReviewDocument,
    upsertFinalReviewSignoff,
    listCompliancePeripherals,
    createCompliancePeripheral,
    updateCompliancePeripheral,
    updateCompliancePeripheralVerification,
    listComplianceAuditLogs,
    runCompliancePreflight
};
