import logger from '../../../../config/logger.js';
import { PERMISSIONS } from '../../../../config/permissions.js';
import * as itemService from '../../../../services/itemService.js';
import * as supplierService from '../../../../services/supplierService.js';
import * as purchaseOrderService from '../../../../services/purchaseOrderService.js';
import * as dispatchOrderService from '../../../../services/dispatchOrderService.js';
import * as jobOrderService from '../../../../services/jobOrderService.js';
import * as stockMovementService from '../../../../services/stockMovementService.js';
import * as analyticsService from '../../../../services/analyticsService.js';
import * as dashboardService from '../../../../services/dashboardService.js';
import * as alertService from '../../../../services/alertService.js';
import * as forecastService from '../../../../services/forecastService.js';
import * as documentationService from '../../../../services/documentationService.js';
import * as tempFileService from '../../../../services/tempFileService.js';
import * as userService from '../../../../services/userService.js';
import * as fileManagementService from '../../../../services/fileManagementService.js';
import * as itemGroupingService from '../../../../services/itemGroupingService.js';
import {
  getAllSettingsUseCase,
  updateSettingsUseCase
} from '../../../settings/index.js';
import { unwrapApplicationResultOrThrow } from '../../../shared/contracts/applicationResultHelpers.js';
import { buildStorageAndGroupingToolRegistry } from './storageAndGroupingToolRegistry.js';
import { buildAnalysisToolRegistry } from './analysisToolRegistry.js';
import { buildUserManagementToolRegistry } from './userManagementToolRegistry.js';
import { buildDashboardAndInsightsToolRegistry } from './dashboardAndInsightsToolRegistry.js';
import { buildDispatchOrderToolRegistry } from './dispatchOrderToolRegistry.js';
import { buildJobOrderToolRegistry } from './jobOrderToolRegistry.js';
import { buildStockMovementToolRegistry } from './stockMovementToolRegistry.js';
import { buildPurchaseOrderToolRegistry } from './purchaseOrderToolRegistry.js';
import { buildItemToolRegistry } from './itemToolRegistry.js';
import { buildSupplierToolRegistry } from './supplierToolRegistry.js';
import { buildCsvTransferToolRegistry } from './csvTransferToolRegistry.js';

const storageAndGroupingToolRegistry = buildStorageAndGroupingToolRegistry({
  fileManagementService,
  itemGroupingService
});

const analysisToolRegistry = buildAnalysisToolRegistry({
  analyticsService,
  jobOrderService
});

const userManagementToolRegistry = buildUserManagementToolRegistry({
  userService,
  tempFileService,
  logger,
  permissions: PERMISSIONS,
  appUrlProvider: () => process.env.APP_URL || 'http://localhost:5173'
});

const aiSettingsService = {
  async getAllSettings() {
    const result = await getAllSettingsUseCase();
    return unwrapApplicationResultOrThrow(result, 'Failed to load system settings');
  },
  async updateSettings(settingsData) {
    const result = await updateSettingsUseCase({ settingsData });
    return unwrapApplicationResultOrThrow(result, 'Failed to update system settings');
  }
};

const dashboardAndInsightsToolRegistry = buildDashboardAndInsightsToolRegistry({
  dashboardService,
  settingsService: aiSettingsService,
  alertService,
  forecastService,
  documentationService
});

const dispatchOrderToolRegistry = buildDispatchOrderToolRegistry({
  dispatchOrderService
});

const jobOrderToolRegistry = buildJobOrderToolRegistry({
  jobOrderService,
  itemService,
  logger
});

const stockMovementToolRegistry = buildStockMovementToolRegistry({
  stockMovementService
});

const purchaseOrderToolRegistry = buildPurchaseOrderToolRegistry({
  purchaseOrderService
});

const itemToolRegistry = buildItemToolRegistry({
  itemService
});

const supplierToolRegistry = buildSupplierToolRegistry({
  supplierService
});

const csvTransferToolRegistry = buildCsvTransferToolRegistry({
  tempFileService,
  itemService,
  supplierService,
  purchaseOrderService,
  jobOrderService,
  stockMovementService,
  logger
});

export const TOOL_REGISTRY_BY_NAME = Object.freeze({
  // Dashboard and insights
  get_dashboard_stats: dashboardAndInsightsToolRegistry,
  get_low_stock_items: dashboardAndInsightsToolRegistry,
  get_system_settings: dashboardAndInsightsToolRegistry,
  update_system_settings: dashboardAndInsightsToolRegistry,
  generate_executive_summary: dashboardAndInsightsToolRegistry,
  get_expiry_alerts: dashboardAndInsightsToolRegistry,
  get_forecast: dashboardAndInsightsToolRegistry,
  search_documentation: dashboardAndInsightsToolRegistry,

  // Inventory items
  get_items: itemToolRegistry,
  get_item_details: itemToolRegistry,
  create_item: itemToolRegistry,
  update_item: itemToolRegistry,
  delete_item: itemToolRegistry,

  // Suppliers
  get_suppliers: supplierToolRegistry,
  get_supplier_details: supplierToolRegistry,
  create_supplier: supplierToolRegistry,
  update_supplier: supplierToolRegistry,
  delete_supplier: supplierToolRegistry,
  add_supplier_item: supplierToolRegistry,

  // Purchase orders
  get_purchase_orders: purchaseOrderToolRegistry,
  create_purchase_order: purchaseOrderToolRegistry,
  receive_purchase_order: purchaseOrderToolRegistry,

  // Dispatch orders
  query_dispatch_orders: dispatchOrderToolRegistry,
  get_dispatch_order_details: dispatchOrderToolRegistry,
  create_dispatch_order: dispatchOrderToolRegistry,
  confirm_dispatch_order: dispatchOrderToolRegistry,
  dispatch_items: dispatchOrderToolRegistry,
  cancel_dispatch_order: dispatchOrderToolRegistry,

  // User management
  get_users: userManagementToolRegistry,
  update_user_role: userManagementToolRegistry,
  toggle_user_status: userManagementToolRegistry,
  remove_user_from_company: userManagementToolRegistry,
  update_user_permissions: userManagementToolRegistry,
  create_user_invitation: userManagementToolRegistry,
  export_users_csv: userManagementToolRegistry,
  import_users_csv: userManagementToolRegistry,
  get_available_permissions: userManagementToolRegistry,

  // Job orders
  get_job_orders: jobOrderToolRegistry,
  create_job_order: jobOrderToolRegistry,
  complete_job_order: jobOrderToolRegistry,

  // Stock movements
  get_stock_movements: stockMovementToolRegistry,
  create_stock_adjustment: stockMovementToolRegistry,

  // Analysis
  analyze_production_feasibility: analysisToolRegistry,
  analyze_reorder_needs: analysisToolRegistry,
  detect_anomalies: analysisToolRegistry,
  get_advanced_analytics: analysisToolRegistry,

  // CSV transfer
  import_csv_data: csvTransferToolRegistry,
  export_to_csv: csvTransferToolRegistry,

  // File management and inventory grouping
  list_files: storageAndGroupingToolRegistry,
  create_folder: storageAndGroupingToolRegistry,
  move_file: storageAndGroupingToolRegistry,
  get_inventory_folders: storageAndGroupingToolRegistry,
  create_inventory_folder: storageAndGroupingToolRegistry,
  bulk_create_inventory_folders: storageAndGroupingToolRegistry,
  move_items_to_inventory_folder: storageAndGroupingToolRegistry,
  get_items_in_inventory_folder: storageAndGroupingToolRegistry,
  delete_inventory_folder: storageAndGroupingToolRegistry,
  bulk_delete_inventory_folders: storageAndGroupingToolRegistry
});

export const executeRegistryTool = async (toolName, args, user) => {
  const registry = TOOL_REGISTRY_BY_NAME[toolName];
  if (!registry) {
    throw new Error(`Unknown tool: ${toolName}`);
  }

  const handler = registry[toolName];
  if (!handler) {
    throw new Error(`No handler registered for tool: ${toolName}`);
  }

  return handler({ args, user, toolName });
};
