import logger from '../../config/logger.js';
import { complianceRepository } from './repositories/complianceRepository.js';
import {
    buildEvaluateComplianceOperationUseCase,
    buildAssertComplianceOperationAllowedUseCase,
    buildGetComplianceProfileUseCase,
    buildSelectComplianceModeUseCase,
    buildUpgradeToCompliantUseCase,
    buildForceNonCompliantModeUseCase,
    buildRevertToNonCompliantModeUseCase,
    buildGetComplianceChecklistUseCase,
    buildActivateCompliantModeUseCase,
    buildUpdateComplianceProfileUseCase,
    buildListComplianceArtifactsUseCase,
    buildCreateComplianceArtifactUseCase,
    buildUpdateComplianceArtifactUseCase,
    buildUpdateComplianceArtifactVerificationUseCase,
    buildListFinalReviewDocumentsUseCase,
    buildUpsertFinalReviewDocumentUseCase,
    buildUploadFinalReviewDocumentUseCase,
    buildReviewFinalReviewDocumentUseCase,
    buildUpsertFinalReviewSignoffUseCase,
    buildListCompliancePeripheralsUseCase,
    buildCreateCompliancePeripheralUseCase,
    buildUpdateCompliancePeripheralUseCase,
    buildUpdateCompliancePeripheralVerificationUseCase,
    buildListComplianceAuditLogsUseCase,
    buildRecordComplianceSecuritySignalUseCase,
    buildListComplianceSecurityIncidentsUseCase,
    buildUpdateComplianceSecurityIncidentStatusUseCase,
    buildCompliancePreflightUseCase
} from './usecases/complianceUseCases.js';

const getSettingsSnapshot = async () => {
    try {
        const settingsModule = await import('../settings/index.js');
        const result = await settingsModule.getAllSettingsUseCase();
        if (result?.success) {
            return result.data || {};
        }
        return {};
    } catch {
        return {};
    }
};

export const evaluateComplianceOperationUseCase = buildEvaluateComplianceOperationUseCase({
    complianceRepository,
    getSettingsSnapshot
});

export const assertComplianceOperationAllowedUseCase = buildAssertComplianceOperationAllowedUseCase({
    evaluateComplianceOperationUseCase,
    complianceRepository,
    logger
});

export const getComplianceProfileUseCase = buildGetComplianceProfileUseCase({
    complianceRepository,
    getSettingsSnapshot
});

export const selectComplianceModeUseCase = buildSelectComplianceModeUseCase({
    complianceRepository,
    logger
});

export const upgradeToCompliantUseCase = buildUpgradeToCompliantUseCase({
    complianceRepository,
    logger
});

export const forceNonCompliantModeUseCase = buildForceNonCompliantModeUseCase({
    complianceRepository,
    logger
});

export const revertToNonCompliantModeUseCase = buildRevertToNonCompliantModeUseCase({
    complianceRepository,
    logger
});

export const getComplianceChecklistUseCase = buildGetComplianceChecklistUseCase({
    complianceRepository,
    getSettingsSnapshot
});

export const activateCompliantModeUseCase = buildActivateCompliantModeUseCase({
    complianceRepository,
    getComplianceChecklistUseCase,
    logger
});

export const updateComplianceProfileUseCase = buildUpdateComplianceProfileUseCase({
    complianceRepository,
    logger
});

export const listComplianceArtifactsUseCase = buildListComplianceArtifactsUseCase({
    complianceRepository
});

export const createComplianceArtifactUseCase = buildCreateComplianceArtifactUseCase({
    complianceRepository,
    logger
});

export const updateComplianceArtifactUseCase = buildUpdateComplianceArtifactUseCase({
    complianceRepository
});

export const updateComplianceArtifactVerificationUseCase = buildUpdateComplianceArtifactVerificationUseCase({
    complianceRepository,
    logger
});

export const listFinalReviewDocumentsUseCase = buildListFinalReviewDocumentsUseCase({
    complianceRepository
});

export const upsertFinalReviewDocumentUseCase = buildUpsertFinalReviewDocumentUseCase({
    complianceRepository,
    logger
});

export const uploadFinalReviewDocumentUseCase = buildUploadFinalReviewDocumentUseCase({
    complianceRepository,
    logger
});

export const reviewFinalReviewDocumentUseCase = buildReviewFinalReviewDocumentUseCase({
    complianceRepository,
    logger
});

export const upsertFinalReviewSignoffUseCase = buildUpsertFinalReviewSignoffUseCase({
    complianceRepository,
    logger
});

export const listCompliancePeripheralsUseCase = buildListCompliancePeripheralsUseCase({
    complianceRepository
});

export const createCompliancePeripheralUseCase = buildCreateCompliancePeripheralUseCase({
    complianceRepository,
    logger
});

export const updateCompliancePeripheralUseCase = buildUpdateCompliancePeripheralUseCase({
    complianceRepository
});

export const updateCompliancePeripheralVerificationUseCase = buildUpdateCompliancePeripheralVerificationUseCase({
    complianceRepository,
    logger
});

export const listComplianceAuditLogsUseCase = buildListComplianceAuditLogsUseCase({
    complianceRepository
});

export const recordComplianceSecuritySignalUseCase = buildRecordComplianceSecuritySignalUseCase({
    complianceRepository,
    logger
});

export const listComplianceSecurityIncidentsUseCase = buildListComplianceSecurityIncidentsUseCase({
    complianceRepository
});

export const updateComplianceSecurityIncidentStatusUseCase = buildUpdateComplianceSecurityIncidentStatusUseCase({
    complianceRepository,
    listComplianceSecurityIncidentsUseCase,
    logger
});

export const compliancePreflightUseCase = buildCompliancePreflightUseCase({
    evaluateComplianceOperationUseCase
});

export const evaluateComplianceOperation = async ({ tenantId, tenant, operation, context = {} }) => (
    evaluateComplianceOperationUseCase({ tenantId, tenant, operation, context })
);

export const assertComplianceOperationAllowed = async ({ tenantId, tenant, operation, context = {}, actorUser = null }) => (
    assertComplianceOperationAllowedUseCase({ tenantId, tenant, operation, context, actorUser })
);

export * from './policy/complianceConstants.js';
export * from './repositories/complianceRepository.js';
