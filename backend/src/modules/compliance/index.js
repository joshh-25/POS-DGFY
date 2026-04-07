import logger from '../../config/logger.js';
import { complianceRepository } from './repositories/complianceRepository.js';
import {
    buildEvaluateComplianceOperationUseCase,
    buildAssertComplianceOperationAllowedUseCase,
    buildGetComplianceProfileUseCase,
    buildSelectComplianceModeUseCase,
    buildUpgradeToCompliantUseCase,
    buildGetComplianceChecklistUseCase,
    buildActivateCompliantModeUseCase,
    buildUpdateComplianceProfileUseCase,
    buildListComplianceArtifactsUseCase,
    buildCreateComplianceArtifactUseCase,
    buildUpdateComplianceArtifactUseCase,
    buildUpdateComplianceArtifactVerificationUseCase,
    buildListCompliancePeripheralsUseCase,
    buildCreateCompliancePeripheralUseCase,
    buildUpdateCompliancePeripheralUseCase,
    buildUpdateCompliancePeripheralVerificationUseCase,
    buildListComplianceAuditLogsUseCase,
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
    complianceRepository
});

export const upgradeToCompliantUseCase = buildUpgradeToCompliantUseCase({
    complianceRepository
});

export const getComplianceChecklistUseCase = buildGetComplianceChecklistUseCase({
    complianceRepository,
    getSettingsSnapshot
});

export const activateCompliantModeUseCase = buildActivateCompliantModeUseCase({
    complianceRepository,
    getComplianceChecklistUseCase
});

export const updateComplianceProfileUseCase = buildUpdateComplianceProfileUseCase({
    complianceRepository
});

export const listComplianceArtifactsUseCase = buildListComplianceArtifactsUseCase({
    complianceRepository
});

export const createComplianceArtifactUseCase = buildCreateComplianceArtifactUseCase({
    complianceRepository
});

export const updateComplianceArtifactUseCase = buildUpdateComplianceArtifactUseCase({
    complianceRepository
});

export const updateComplianceArtifactVerificationUseCase = buildUpdateComplianceArtifactVerificationUseCase({
    complianceRepository
});

export const listCompliancePeripheralsUseCase = buildListCompliancePeripheralsUseCase({
    complianceRepository
});

export const createCompliancePeripheralUseCase = buildCreateCompliancePeripheralUseCase({
    complianceRepository
});

export const updateCompliancePeripheralUseCase = buildUpdateCompliancePeripheralUseCase({
    complianceRepository
});

export const updateCompliancePeripheralVerificationUseCase = buildUpdateCompliancePeripheralVerificationUseCase({
    complianceRepository
});

export const listComplianceAuditLogsUseCase = buildListComplianceAuditLogsUseCase({
    complianceRepository
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
