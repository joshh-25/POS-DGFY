import { businessAdminOverviewRepository } from './repositories/businessAdminOverviewRepository.js';
import { businessAdminMultiCompanyRepository } from './repositories/businessAdminMultiCompanyRepository.js';
import { buildGetBusinessAdminOverviewUseCase } from './usecases/businessAdminOverviewUseCase.js';
import { buildGetBusinessAdminMultiCompanyOverviewUseCase } from './usecases/businessAdminMultiCompanyOverviewUseCase.js';
import { buildGetBusinessAdminBootstrapUseCase } from './usecases/businessAdminBootstrapUseCase.js';
import { buildListBusinessAdminAuditUseCase } from './usecases/businessAdminAuditUseCase.js';
import { buildCancelBusinessAdminApprovalUseCase, buildDecideBusinessAdminApprovalUseCase, buildListBusinessAdminApprovalsUseCase } from './usecases/businessAdminApprovalUseCase.js';
import { buildExportBusinessAdminReportUseCase, buildGetBusinessAdminReportDatasetUseCase, buildGetBusinessAdminReportsUseCase, buildListBusinessAdminReportDefinitionsUseCase } from './usecases/businessAdminReportsUseCase.js';
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
import { businessAdminWorkforceRepository } from './repositories/businessAdminWorkforceRepository.js';
import { businessAdminInventoryReportRepository } from './repositories/businessAdminInventoryReportRepository.js';
import { businessAdminFinancialReportRepository } from './repositories/businessAdminFinancialReportRepository.js';
import { buildGetBusinessAdminWorkforceUseCase } from './usecases/businessAdminWorkforceUseCase.js';
import { businessAdminFiscalRepository } from './repositories/businessAdminFiscalRepository.js';
import { buildGetBusinessAdminFiscalUseCase } from './usecases/businessAdminFiscalUseCase.js';
import { businessAdminRecipeRepository } from './repositories/businessAdminRecipeRepository.js';
import { buildListBusinessAdminRecipesUseCase } from './usecases/businessAdminRecipeUseCase.js';
import { businessAdminCustomerRepository } from './repositories/businessAdminCustomerRepository.js';
import { buildListBusinessAdminCustomersUseCase } from './usecases/businessAdminCustomerUseCase.js';
import { buildGetBusinessAdminCustomerDetailUseCase } from './usecases/businessAdminCustomerDetailUseCase.js';
import { buildAcknowledgeBusinessAdminNotificationUseCase, buildDismissBusinessAdminNotificationUseCase, buildListBusinessAdminActivityUseCase, buildListBusinessAdminNotificationsUseCase, buildMarkBusinessAdminNotificationReadUseCase } from './usecases/businessAdminNotificationUseCase.js';
import { resolveWorkflowCapabilitySettings } from '../shared/utils/workflowCapabilitySettingsCache.js';
import { modeHasCapability } from '@sieitzz/shared-constants/workflowModes';
import dbStore from '../../utils/dbStore.js';
import { buildStockBearingItemWhere } from '../shared/utils/stockBearingPolicy.js';

export const reconcileBusinessAdminAlerts = () => reconcileBusinessAdminAlertSnapshots({ repository: businessAdminAlertSnapshotRepository });
import { posRepository } from '../pos/repositories/posRepository.js';
import { getItemsCostMetrics } from '../inventory/services/costValuationService.js';
import { commercePaymentRepository } from '../commercePayments/index.js';

// Business Admin consumes the inventory module's authoritative cost service but
// does not own a second valuation implementation.  The old BA branch called a
// helper that no longer exists; this adapter projects the current per-item
// scoped metrics into the stable BA response shape.
const getWeightedInventoryValueByLocation = async ({ locations = [] } = {}) => {
    const Item = dbStore.get('Item');
    const activeItems = await Item.findAll({
        where: buildStockBearingItemWhere({ status: 'active', deleted_at: null }),
        attributes: ['item_id', 'current_stock', 'cost_per_unit', 'fifo_enabled'],
        raw: true
    });
    const safeLocations = Array.isArray(locations) ? locations : [];
    const rows = await Promise.all(safeLocations.map(async (location) => {
        const locationId = Number(location.location_id);
        const metricsByItem = await getItemsCostMetrics({ items: activeItems, locationId });
        let availableQty = 0;
        let inventoryValue = 0;
        let driftItemCount = 0;
        metricsByItem.forEach((metrics) => {
            const scoped = metrics?.scoped;
            if (!scoped) return;
            availableQty += Number(scoped.available_qty) || 0;
            inventoryValue += Number(scoped.inventory_value) || 0;
            if (scoped.diagnostics?.has_drift) driftItemCount += 1;
        });
        return {
            location_id: Number.isInteger(locationId) && locationId > 0 ? locationId : null,
            location_name: location.name || `Branch #${locationId}`,
            available_qty: Number(availableQty.toFixed(4)),
            inventory_value: Number(inventoryValue.toFixed(4)),
            weighted_avg_cost: availableQty > 0 ? Number((inventoryValue / availableQty).toFixed(4)) : 0,
            drift_item_count: driftItemCount,
            stock_bearing_item_count: activeItems.length
        };
    }));
    const weightedTotalInventoryValue = rows.reduce((sum, row) => sum + (Number(row.inventory_value) || 0), 0);
    const weightedTotalAvailableQty = rows.reduce((sum, row) => sum + (Number(row.available_qty) || 0), 0);
    const legacyTotalInventoryValue = activeItems.reduce((sum, item) => (
        sum + (Number(item.current_stock) || 0) * (Number(item.cost_per_unit) || 0)
    ), 0);
    return {
        locations: rows,
        weighted_total_inventory_value: Number(weightedTotalInventoryValue.toFixed(4)),
        weighted_total_available_qty: Number(weightedTotalAvailableQty.toFixed(4)),
        weighted_average_cost_per_unit: weightedTotalAvailableQty > 0
            ? Number((weightedTotalInventoryValue / weightedTotalAvailableQty).toFixed(4))
            : 0,
        legacy_total_inventory_value: Number(legacyTotalInventoryValue.toFixed(4))
    };
};

export const getBusinessAdminOverviewUseCase = buildGetBusinessAdminOverviewUseCase({
    businessAdminOverviewRepository,
    businessAdminAlertSnapshotRepository
});

export const getBusinessAdminMultiCompanyOverviewUseCase = buildGetBusinessAdminMultiCompanyOverviewUseCase({
    businessAdminMultiCompanyRepository,
    getBusinessAdminOverviewUseCase
});

export const getBusinessAdminBootstrapUseCase = buildGetBusinessAdminBootstrapUseCase({
    businessAdminOverviewRepository,
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
    // The current POS branch has no generic exception-approval command. Keep
    // the Business Admin queue read-only until a canonical owner contract is
    // approved; never invent a second refund/shift mutation path here.
    decidePosExceptionApprovalUseCase: null
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
export const listBusinessAdminReportDefinitionsUseCase = buildListBusinessAdminReportDefinitionsUseCase();
export const getBusinessAdminReportDatasetUseCase = buildGetBusinessAdminReportDatasetUseCase(businessAdminReportDependencies);
export const exportBusinessAdminReportUseCase = buildExportBusinessAdminReportUseCase(businessAdminReportDependencies);

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

const businessAdminNotificationDependencies = { businessAdminOverviewRepository, businessAdminAlertSnapshotRepository };
export const listBusinessAdminNotificationsUseCase = buildListBusinessAdminNotificationsUseCase(businessAdminNotificationDependencies);
export const markBusinessAdminNotificationReadUseCase = buildMarkBusinessAdminNotificationReadUseCase(businessAdminNotificationDependencies);
export const dismissBusinessAdminNotificationUseCase = buildDismissBusinessAdminNotificationUseCase(businessAdminNotificationDependencies);
export const acknowledgeBusinessAdminNotificationUseCase = buildAcknowledgeBusinessAdminNotificationUseCase(businessAdminNotificationDependencies);
export const listBusinessAdminActivityUseCase = buildListBusinessAdminActivityUseCase(businessAdminNotificationDependencies);
