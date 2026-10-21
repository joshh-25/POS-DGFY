import { businessAdminOverviewRepository } from './repositories/businessAdminOverviewRepository.js';
import { businessAdminCompanyRepository } from './repositories/businessAdminCompanyRepository.js';
import { businessAdminMultiCompanyRepository } from './repositories/businessAdminMultiCompanyRepository.js';
import { buildGetBusinessAdminOverviewUseCase } from './usecases/businessAdminOverviewUseCase.js';
import { buildGetBusinessAdminMultiCompanyOverviewUseCase } from './usecases/businessAdminMultiCompanyOverviewUseCase.js';
import { buildGetBusinessAdminBootstrapUseCase } from './usecases/businessAdminBootstrapUseCase.js';
import { buildListBusinessAdminAuditUseCase } from './usecases/businessAdminAuditUseCase.js';
import { buildCancelBusinessAdminApprovalUseCase, buildDecideBusinessAdminApprovalUseCase, buildListBusinessAdminApprovalsUseCase } from './usecases/businessAdminApprovalUseCase.js';
import { buildExportBusinessAdminReportUseCase, buildGetBusinessAdminReportDatasetUseCase, buildGetBusinessAdminReportsUseCase, buildListBusinessAdminReportDefinitionsUseCase } from './usecases/businessAdminReportsUseCase.js';
import { buildGetBusinessAdminPosActivityAnalyticsUseCase } from './usecases/businessAdminPosActivityUseCase.js';
import { businessAdminPosActivityRepository } from './repositories/businessAdminPosActivityRepository.js';
import { buildGetBusinessAdminInventoryValuationUseCase } from './usecases/businessAdminInventoryValuationUseCase.js';
import { buildListBusinessAdminInventoryStockUseCase } from './usecases/businessAdminInventoryStockUseCase.js';
import { buildCreateBusinessAdminSavedReportViewUseCase, buildDeleteBusinessAdminSavedReportViewUseCase, buildListBusinessAdminSavedReportViewsUseCase } from './usecases/businessAdminSavedReportViewUseCase.js';
import { businessAdminSavedReportViewRepository } from './repositories/businessAdminSavedReportViewRepository.js';
import { businessAdminAlertSnapshotRepository } from './repositories/businessAdminAlertSnapshotRepository.js';
import { reconcileBusinessAdminAlertSnapshots } from './services/businessAdminAlertSnapshotService.js';
import { businessAdminOrderCenterRepository } from './repositories/businessAdminOrderCenterRepository.js';
import { buildGetBusinessAdminOrderDetailUseCase, buildListBusinessAdminOrdersUseCase } from './usecases/businessAdminOrderCenterUseCase.js';
import { businessAdminShiftHistoryRepository } from './repositories/businessAdminShiftHistoryRepository.js';
import { buildListBusinessAdminShiftsUseCase } from './usecases/businessAdminShiftHistoryUseCase.js';
import { buildGetBusinessAdminCommerceMonitoringUseCase } from './usecases/businessAdminCommerceMonitoringUseCase.js';
import { buildGetBusinessAdminEJournalEvidenceUseCase, buildListBusinessAdminEvidenceCatalogUseCase } from './usecases/businessAdminEvidenceUseCase.js';
import { businessAdminWorkforceRepository } from './repositories/businessAdminWorkforceRepository.js';
import { businessAdminInventoryReportRepository } from './repositories/businessAdminInventoryReportRepository.js';
import { businessAdminFinancialReportRepository } from './repositories/businessAdminFinancialReportRepository.js';
import { buildGetBusinessAdminWorkforceUseCase } from './usecases/businessAdminWorkforceUseCase.js';
import { buildGetBusinessAdminAttendanceUseCase } from './usecases/businessAdminAttendanceUseCase.js';
import { buildBusinessAdminEndAttendanceShiftUseCase } from './usecases/businessAdminEndAttendanceShiftUseCase.js';
import { businessAdminFiscalRepository } from './repositories/businessAdminFiscalRepository.js';
import { buildGetBusinessAdminFiscalUseCase } from './usecases/businessAdminFiscalUseCase.js';
import { businessAdminRecipeRepository } from './repositories/businessAdminRecipeRepository.js';
import { buildListBusinessAdminRecipesUseCase } from './usecases/businessAdminRecipeUseCase.js';
import { businessAdminCustomerRepository } from './repositories/businessAdminCustomerRepository.js';
import { buildListBusinessAdminCustomersUseCase } from './usecases/businessAdminCustomerUseCase.js';
import { buildGetBusinessAdminCustomerDetailUseCase } from './usecases/businessAdminCustomerDetailUseCase.js';
import { buildCreateBusinessAdminCustomerUseCase } from './usecases/businessAdminCustomerWriteUseCase.js';
import { businessAdminExpenseRepository } from './repositories/businessAdminExpenseRepository.js';
import { buildCreateBusinessAdminExpenseUseCase, buildListBusinessAdminExpensesUseCase, buildVoidBusinessAdminExpenseUseCase } from './usecases/businessAdminExpenseUseCase.js';
import { buildAcknowledgeBusinessAdminNotificationUseCase, buildDismissBusinessAdminNotificationUseCase, buildListBusinessAdminNotificationsUseCase, buildMarkBusinessAdminNotificationReadUseCase } from './usecases/businessAdminNotificationUseCase.js';
import { resolveWorkflowCapabilitySettings } from '../shared/utils/workflowCapabilitySettingsCache.js';
import { modeHasCapability } from '@sieitzz/shared-constants/workflowModes';
import { closeTerminalShiftUseCase, decidePosExceptionApprovalUseCase } from '../pos/index.js';

export const reconcileBusinessAdminAlerts = () => reconcileBusinessAdminAlertSnapshots({ repository: businessAdminAlertSnapshotRepository });
import { posRepository } from '../pos/repositories/posRepository.js';
import { getWeightedInventoryValueByLocation } from '../inventory/services/costValuationService.js';
import { commercePaymentRepository } from '../commercePayments/index.js';
import { buildGetBusinessAdminCompanyUseCase } from './usecases/businessAdminCompanyUseCase.js';
import { buildUpdateBusinessAdminCompanyNameUseCase } from './usecases/businessAdminCompanyNameUseCase.js';
import { syncStorefrontDiscoveryWithReliability } from '../../services/storefrontDiscoverySyncReliabilityService.js';
import { publishPosSettingsChange } from '../shared/services/catalogChangeEventBus.js';
import logger from '../../config/logger.js';
import { readTenantCapabilities } from '../tenants/usecases/tenantCapabilitySettings.js';
import tenantConnector from '../../utils/TenantConnector.js';

export const getBusinessAdminOverviewUseCase = buildGetBusinessAdminOverviewUseCase({
    businessAdminOverviewRepository,
    businessAdminAlertSnapshotRepository
});
export const getBusinessAdminCompanyUseCase = buildGetBusinessAdminCompanyUseCase({ businessAdminOverviewRepository });
export const updateBusinessAdminCompanyNameUseCase = buildUpdateBusinessAdminCompanyNameUseCase({
    businessAdminCompanyRepository,
    syncStorefrontDiscoveryWithReliability,
    publishPosSettingsChange,
    logger
});

export const getBusinessAdminMultiCompanyOverviewUseCase = buildGetBusinessAdminMultiCompanyOverviewUseCase({
    businessAdminMultiCompanyRepository,
    getBusinessAdminOverviewUseCase
});

export const getBusinessAdminBootstrapUseCase = buildGetBusinessAdminBootstrapUseCase({
    businessAdminOverviewRepository,
    tenantCapabilityResolver: async ({ tenant }) => {
        try {
            return await readTenantCapabilities({ tenant, tenantConnector });
        } catch (error) {
            logger.warn('[BusinessAdmin] Tenant capability bootstrap read failed; using safe defaults', {
                tenant_id: tenant?.id || null,
                error: error.message
            });
            return { pos_enabled: true, storefront_visible: false, unavailable: true };
        }
    },
    workflowCapabilityResolver: async () => {
        const settings = await resolveWorkflowCapabilitySettings();
        return {
            mode: settings.mode,
            capabilities: {
                fnbDining: modeHasCapability(settings.mode, 'fnbDining', settings.enabledCapabilities, settings.disabledCapabilities),
                tableService: modeHasCapability(settings.mode, 'tableService', settings.enabledCapabilities, settings.disabledCapabilities),
                kitchenQueue: modeHasCapability(settings.mode, 'kitchenQueue', settings.enabledCapabilities, settings.disabledCapabilities),
                restaurantServiceCharge: modeHasCapability(settings.mode, 'restaurantServiceCharge', settings.enabledCapabilities, settings.disabledCapabilities)
            }
        };
    }
});

export const listBusinessAdminAuditUseCase = buildListBusinessAdminAuditUseCase({
    businessAdminOverviewRepository
});

export const listBusinessAdminApprovalsUseCase = buildListBusinessAdminApprovalsUseCase({
    businessAdminOverviewRepository
});

export const decideBusinessAdminApprovalUseCase = buildDecideBusinessAdminApprovalUseCase({
    // Back Office decides; POS remains the canonical owner of the atomic
    // transaction and inventory mutation.
    decidePosExceptionApprovalUseCase
});

export const cancelBusinessAdminApprovalUseCase = buildCancelBusinessAdminApprovalUseCase({
    cancelPosExceptionApprovalUseCase: null
});

export const getBusinessAdminReportsUseCase = buildGetBusinessAdminReportsUseCase({
    businessAdminOverviewRepository,
    posRepository
});

const businessAdminReportDependencies = {
    businessAdminOverviewRepository,
    posRepository,
    businessAdminFinancialReportRepository,
    businessAdminInventoryReportRepository,
    getBusinessAdminInventoryValuationUseCase: null
};
export const getBusinessAdminPosActivityAnalyticsUseCase = buildGetBusinessAdminPosActivityAnalyticsUseCase({
    businessAdminOverviewRepository,
    businessAdminPosActivityRepository
});

export const listBusinessAdminReportDefinitionsUseCase = buildListBusinessAdminReportDefinitionsUseCase();
export const getBusinessAdminReportDatasetUseCase = buildGetBusinessAdminReportDatasetUseCase(businessAdminReportDependencies);
export const exportBusinessAdminReportUseCase = buildExportBusinessAdminReportUseCase(businessAdminReportDependencies);
export const listBusinessAdminEvidenceCatalogUseCase = buildListBusinessAdminEvidenceCatalogUseCase({ posRepository });
export const getBusinessAdminEJournalEvidenceUseCase = buildGetBusinessAdminEJournalEvidenceUseCase({
    businessAdminOverviewRepository,
    posRepository
});

export const getBusinessAdminInventoryValuationUseCase = buildGetBusinessAdminInventoryValuationUseCase({
    businessAdminOverviewRepository,
    getWeightedInventoryValueByLocation
});
export const listBusinessAdminInventoryStockUseCase = buildListBusinessAdminInventoryStockUseCase({
    businessAdminOverviewRepository,
    businessAdminInventoryReportRepository
});
businessAdminReportDependencies.getBusinessAdminInventoryValuationUseCase = getBusinessAdminInventoryValuationUseCase;

export const listBusinessAdminSavedReportViewsUseCase = buildListBusinessAdminSavedReportViewsUseCase({
    businessAdminOverviewRepository,
    businessAdminSavedReportViewRepository
});

export const createBusinessAdminSavedReportViewUseCase = buildCreateBusinessAdminSavedReportViewUseCase({
    businessAdminOverviewRepository,
    businessAdminSavedReportViewRepository
});

export const deleteBusinessAdminSavedReportViewUseCase = buildDeleteBusinessAdminSavedReportViewUseCase({
    businessAdminOverviewRepository,
    businessAdminSavedReportViewRepository
});

export const listBusinessAdminOrdersUseCase = buildListBusinessAdminOrdersUseCase({
    businessAdminOrderCenterRepository,
    businessAdminOverviewRepository
});

export const getBusinessAdminOrderDetailUseCase = buildGetBusinessAdminOrderDetailUseCase({
    businessAdminOrderCenterRepository,
    businessAdminOverviewRepository
});

export const listBusinessAdminShiftsUseCase = buildListBusinessAdminShiftsUseCase({
    businessAdminShiftHistoryRepository,
    businessAdminOverviewRepository
});

export const getBusinessAdminCommerceMonitoringUseCase = buildGetBusinessAdminCommerceMonitoringUseCase({
    commercePaymentRepository
});

export const getBusinessAdminWorkforceUseCase = buildGetBusinessAdminWorkforceUseCase({
    businessAdminWorkforceRepository,
    businessAdminOverviewRepository
});

export const getBusinessAdminAttendanceUseCase = buildGetBusinessAdminAttendanceUseCase({
    businessAdminOverviewRepository,
    posRepository,
    businessAdminShiftHistoryRepository
});

export const endBusinessAdminAttendanceShiftUseCase = buildBusinessAdminEndAttendanceShiftUseCase({
    businessAdminOverviewRepository,
    posRepository,
    closeTerminalShiftUseCase
});

export const getBusinessAdminFiscalUseCase = buildGetBusinessAdminFiscalUseCase({
    businessAdminFiscalRepository,
    businessAdminOverviewRepository,
    posRepository
});

export const listBusinessAdminRecipesUseCase = buildListBusinessAdminRecipesUseCase({
    businessAdminRecipeRepository,
    businessAdminOverviewRepository
});

export const listBusinessAdminCustomersUseCase = buildListBusinessAdminCustomersUseCase({
    businessAdminCustomerRepository,
    businessAdminOverviewRepository
});
export const getBusinessAdminCustomerDetailUseCase = buildGetBusinessAdminCustomerDetailUseCase({
    businessAdminCustomerRepository,
    businessAdminOverviewRepository
});
export const createBusinessAdminCustomerUseCase = buildCreateBusinessAdminCustomerUseCase({
    businessAdminCustomerRepository
});

const businessAdminExpenseDependencies = {
    businessAdminExpenseRepository,
    businessAdminOverviewRepository
};
export const listBusinessAdminExpensesUseCase = buildListBusinessAdminExpensesUseCase(businessAdminExpenseDependencies);
export const createBusinessAdminExpenseUseCase = buildCreateBusinessAdminExpenseUseCase(businessAdminExpenseDependencies);
export const voidBusinessAdminExpenseUseCase = buildVoidBusinessAdminExpenseUseCase(businessAdminExpenseDependencies);

const businessAdminNotificationDependencies = { businessAdminOverviewRepository, businessAdminAlertSnapshotRepository };
export const listBusinessAdminNotificationsUseCase = buildListBusinessAdminNotificationsUseCase(businessAdminNotificationDependencies);
export const markBusinessAdminNotificationReadUseCase = buildMarkBusinessAdminNotificationReadUseCase(businessAdminNotificationDependencies);
export const dismissBusinessAdminNotificationUseCase = buildDismissBusinessAdminNotificationUseCase(businessAdminNotificationDependencies);
export const acknowledgeBusinessAdminNotificationUseCase = buildAcknowledgeBusinessAdminNotificationUseCase(businessAdminNotificationDependencies);
