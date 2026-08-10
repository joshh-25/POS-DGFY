/**
 * AI Diagnostics Service
 *
 * Computes a real-time capability and knowledge gap report for the SKUpervisor
 * AI assistant. Compares the static SYSTEM_FEATURE_MAP against registered AI tools
 * and the tenant's live database to surface three classes of gaps:
 *
 *   1. Feature Gaps    — system routes/models that have no AI tool counterpart
 *   2. Knowledge Gaps  — tenant data or context the AI cannot access
 *   3. Coverage Metrics — per-category percentage breakdown
 *
 * NOTE: When adding a new tool to aiTools.js, update SYSTEM_FEATURE_MAP below
 * to mark the corresponding feature as covered. Cross-reference: apps/dgfy-api/src/config/aiTools.js
 *
 * This service is stateless and read-only. It does NOT mutate any data.
 */

import dbStore from '../utils/dbStore.js';
import { Op } from 'sequelize';
import { buildVisibleWhere } from '../utils/softDeletePolicy.js';

/**
 * Ground-truth map of every system capability vs what AI tool covers it.
 * status: 'covered' | 'gap'
 * severity (for gaps): 'high' | 'medium' | 'low'
 */
const SYSTEM_FEATURE_MAP = [
  // ─── INVENTORY ────────────────────────────────────────────────────────────
  {
    id: 'items_view',
    category: 'Inventory',
    feature: 'View and search items',
    covered_by: 'get_items',
    status: 'covered'
  },
  {
    id: 'items_details',
    category: 'Inventory',
    feature: 'Get item details (FIFO batches, suppliers, composition)',
    covered_by: 'get_item_details',
    status: 'covered'
  },
  {
    id: 'items_create',
    category: 'Inventory',
    feature: 'Create new items',
    covered_by: 'create_item',
    status: 'covered'
  },
  {
    id: 'items_update',
    category: 'Inventory',
    feature: 'Update item details',
    covered_by: 'update_item',
    status: 'covered'
  },
  {
    id: 'items_delete',
    category: 'Inventory',
    feature: 'Soft-delete items',
    covered_by: 'delete_item',
    status: 'covered'
  },
  {
    id: 'items_restore',
    category: 'Inventory',
    feature: 'Restore soft-deleted items',
    covered_by: null,
    status: 'gap',
    severity: 'medium',
    recommendation: 'Add a restore_item tool mapped to itemService.restoreItem(). The backend supports soft-delete reversal but no AI tool exposes it.'
  },
  {
    id: 'items_bulk_update',
    category: 'Inventory',
    feature: 'Bulk update multiple items at once',
    covered_by: null,
    status: 'gap',
    severity: 'low',
    recommendation: 'Add a bulk_update_items tool accepting an array of item IDs and change fields.'
  },
  {
    id: 'items_extended_properties',
    category: 'Inventory',
    feature: 'Item extended properties (allergens, nutrition, quality control)',
    covered_by: null,
    status: 'gap',
    severity: 'low',
    recommendation: 'ItemNutrition, ItemAllergen, and ItemQualityControl models exist in the DB but are not exposed to the AI.'
  },
  {
    id: 'product_composition_manage',
    category: 'Inventory',
    feature: 'Add or remove product recipe ingredients',
    covered_by: null,
    status: 'gap',
    severity: 'high',
    recommendation: 'ProductComposition model exists. Add add_ingredient_to_recipe and remove_ingredient_from_recipe tools to allow AI to manage nested product recipes after creation.'
  },

  // ─── INVENTORY FOLDERS ────────────────────────────────────────────────────
  {
    id: 'folders_view',
    category: 'Inventory',
    feature: 'View inventory folders',
    covered_by: 'get_inventory_folders',
    status: 'covered'
  },
  {
    id: 'folders_view_items',
    category: 'Inventory',
    feature: 'View items in a specific folder',
    covered_by: 'get_items_in_inventory_folder',
    status: 'covered'
  },
  {
    id: 'folders_create',
    category: 'Inventory',
    feature: 'Create inventory folders',
    covered_by: 'create_inventory_folder',
    status: 'covered'
  },
  {
    id: 'folders_bulk_create',
    category: 'Inventory',
    feature: 'Bulk create inventory folders',
    covered_by: 'bulk_create_inventory_folders',
    status: 'covered'
  },
  {
    id: 'folders_move_items',
    category: 'Inventory',
    feature: 'Move items into a folder',
    covered_by: 'move_items_to_inventory_folder',
    status: 'covered'
  },
  {
    id: 'folders_delete',
    category: 'Inventory',
    feature: 'Delete inventory folder',
    covered_by: 'delete_inventory_folder',
    status: 'covered'
  },
  {
    id: 'folders_bulk_delete',
    category: 'Inventory',
    feature: 'Bulk delete inventory folders',
    covered_by: 'bulk_delete_inventory_folders',
    status: 'covered'
  },
  {
    id: 'folders_rename',
    category: 'Inventory',
    feature: 'Rename or update an existing inventory folder',
    covered_by: null,
    status: 'gap',
    severity: 'medium',
    recommendation: 'Add an update_inventory_folder tool. Folders can be created and deleted but not renamed after creation.'
  },

  // ─── SUPPLIERS ────────────────────────────────────────────────────────────
  {
    id: 'suppliers_view',
    category: 'Suppliers',
    feature: 'View and search suppliers',
    covered_by: 'get_suppliers',
    status: 'covered'
  },
  {
    id: 'suppliers_details',
    category: 'Suppliers',
    feature: 'Get supplier details and their items',
    covered_by: 'get_supplier_details',
    status: 'covered'
  },
  {
    id: 'suppliers_create',
    category: 'Suppliers',
    feature: 'Create new suppliers',
    covered_by: 'create_supplier',
    status: 'covered'
  },
  {
    id: 'suppliers_update',
    category: 'Suppliers',
    feature: 'Update supplier details',
    covered_by: 'update_supplier',
    status: 'covered'
  },
  {
    id: 'suppliers_delete',
    category: 'Suppliers',
    feature: 'Soft-delete suppliers',
    covered_by: 'delete_supplier',
    status: 'covered'
  },
  {
    id: 'suppliers_restore',
    category: 'Suppliers',
    feature: 'Restore soft-deleted suppliers',
    covered_by: null,
    status: 'gap',
    severity: 'medium',
    recommendation: 'Add a restore_supplier tool. The backend supports soft-delete reversal for suppliers.'
  },
  {
    id: 'suppliers_add_item',
    category: 'Suppliers',
    feature: 'Link an item to a supplier with price and MOQ',
    covered_by: 'add_supplier_item',
    status: 'covered'
  },
  {
    id: 'bulk_discounts',
    category: 'Suppliers',
    feature: 'Manage bulk discount pricing tiers',
    covered_by: null,
    status: 'gap',
    severity: 'low',
    recommendation: 'BulkDiscount model exists in the database but no AI tool maps to it.'
  },

  // ─── PURCHASE ORDERS ──────────────────────────────────────────────────────
  {
    id: 'po_view',
    category: 'Orders',
    feature: 'View and filter purchase orders',
    covered_by: 'get_purchase_orders',
    status: 'covered'
  },
  {
    id: 'po_create',
    category: 'Orders',
    feature: 'Create purchase orders',
    covered_by: 'create_purchase_order',
    status: 'covered'
  },
  {
    id: 'po_receive',
    category: 'Orders',
    feature: 'Receive purchase orders (creates FIFO batches)',
    covered_by: 'receive_purchase_order',
    status: 'covered'
  },
  {
    id: 'po_archive',
    category: 'Orders',
    feature: 'Archive or restore purchase orders',
    covered_by: null,
    status: 'gap',
    severity: 'medium',
    recommendation: 'An archive route exists in purchaseOrders.js but no AI tool exposes archive/restore functionality.'
  },
  {
    id: 'po_archived_view',
    category: 'Orders',
    feature: 'View archived purchase orders',
    covered_by: null,
    status: 'gap',
    severity: 'low',
    recommendation: 'Add an archived filter parameter to the get_purchase_orders tool so AI can query archived POs.'
  },
  {
    id: 'po_receive_token',
    category: 'Orders',
    feature: 'Manage receive tokens for QR-based PO receiving',
    covered_by: null,
    status: 'gap',
    severity: 'low',
    recommendation: 'ReceiveToken model and receiveTokens.js route exist but AI has no tools for generating or validating tokens.'
  },

  // ─── JOB ORDERS ───────────────────────────────────────────────────────────
  {
    id: 'jo_view',
    category: 'Orders',
    feature: 'View and filter job orders',
    covered_by: 'get_job_orders',
    status: 'covered'
  },
  {
    id: 'jo_create',
    category: 'Orders',
    feature: 'Create job orders',
    covered_by: 'create_job_order',
    status: 'covered'
  },
  {
    id: 'jo_complete',
    category: 'Orders',
    feature: 'Complete job orders (consumes ingredients)',
    covered_by: 'complete_job_order',
    status: 'covered'
  },
  {
    id: 'jo_transition',
    category: 'Orders',
    feature: 'Transition job order from draft to in_progress',
    covered_by: null,
    status: 'gap',
    severity: 'medium',
    recommendation: 'Add a start_job_order tool to move a JO from draft to in_progress state.'
  },
  {
    id: 'jo_archive',
    category: 'Orders',
    feature: 'Archive or restore job orders',
    covered_by: null,
    status: 'gap',
    severity: 'medium',
    recommendation: 'Archive route exists in jobOrders.js but no AI tool exposes it.'
  },

  // ─── STOCK MOVEMENTS ──────────────────────────────────────────────────────
  {
    id: 'stock_view',
    category: 'Stock',
    feature: 'View stock movement audit trail',
    covered_by: 'get_stock_movements',
    status: 'covered'
  },
  {
    id: 'stock_adjust',
    category: 'Stock',
    feature: 'Create manual stock adjustments',
    covered_by: 'create_stock_adjustment',
    status: 'covered'
  },
  {
    id: 'stock_void',
    category: 'Stock',
    feature: 'Void (reverse) stock movements',
    covered_by: null,
    status: 'gap',
    severity: 'high',
    recommendation: 'A void route exists in stockMovements.js. Add a void_stock_movement tool — voiding is a critical audit control that the AI cannot currently perform.'
  },
  {
    id: 'batch_lineage',
    category: 'Stock',
    feature: 'View batch lineage for traceability',
    covered_by: null,
    status: 'gap',
    severity: 'low',
    recommendation: 'BatchLineage model exists but the AI cannot query batch composition or traceability chains.'
  },

  // ─── ANALYTICS ────────────────────────────────────────────────────────────
  {
    id: 'dashboard_stats',
    category: 'Analytics',
    feature: 'View dashboard statistics (totals, value, health)',
    covered_by: 'get_dashboard_stats',
    status: 'covered'
  },
  {
    id: 'low_stock_alerts',
    category: 'Analytics',
    feature: 'Get low stock item alerts',
    covered_by: 'get_low_stock_items',
    status: 'covered'
  },
  {
    id: 'expiry_alerts',
    category: 'Analytics',
    feature: 'Get batch expiry alerts',
    covered_by: 'get_expiry_alerts',
    status: 'covered'
  },
  {
    id: 'forecast',
    category: 'Analytics',
    feature: 'Stock level forecasting',
    covered_by: 'get_forecast',
    status: 'covered'
  },
  {
    id: 'production_feasibility',
    category: 'Analytics',
    feature: 'Analyze production feasibility for nested products',
    covered_by: 'analyze_production_feasibility',
    status: 'covered'
  },
  {
    id: 'reorder_analysis',
    category: 'Analytics',
    feature: 'Analyze reorder needs based on burn rate',
    covered_by: 'analyze_reorder_needs',
    status: 'covered'
  },
  {
    id: 'anomaly_detection',
    category: 'Analytics',
    feature: 'Detect unusual stock anomalies',
    covered_by: 'detect_anomalies',
    status: 'covered'
  },
  {
    id: 'executive_summary',
    category: 'Analytics',
    feature: 'Generate executive summary report',
    covered_by: 'generate_executive_summary',
    status: 'covered'
  },
  {
    id: 'advanced_analytics',
    category: 'Analytics',
    feature: 'Supplier performance and cost analysis',
    covered_by: 'get_advanced_analytics',
    status: 'covered'
  },
  {
    id: 'report_snapshots',
    category: 'Analytics',
    feature: 'Save and retrieve custom report snapshots',
    covered_by: null,
    status: 'gap',
    severity: 'medium',
    recommendation: 'ReportSnapshot model exists but AI cannot save or load report snapshots.'
  },

  // ─── USERS ────────────────────────────────────────────────────────────────
  {
    id: 'users_view',
    category: 'Users',
    feature: 'View system users',
    covered_by: 'get_users',
    status: 'covered'
  },
  {
    id: 'users_invite',
    category: 'Users',
    feature: 'Invite new users via email',
    covered_by: 'create_user_invitation',
    status: 'covered'
  },
  {
    id: 'users_role',
    category: 'Users',
    feature: 'Change user roles',
    covered_by: 'update_user_role',
    status: 'covered'
  },
  {
    id: 'users_status',
    category: 'Users',
    feature: 'Activate or deactivate user accounts',
    covered_by: 'toggle_user_status',
    status: 'covered'
  },
  {
    id: 'users_permissions',
    category: 'Users',
    feature: 'Edit granular user permissions',
    covered_by: 'update_user_permissions',
    status: 'covered'
  },
  {
    id: 'users_remove',
    category: 'Users',
    feature: 'Remove users from the company (soft delete)',
    covered_by: 'remove_user_from_company',
    status: 'covered'
  },
  {
    id: 'users_export',
    category: 'Users',
    feature: 'Export user list to CSV',
    covered_by: 'export_users_csv',
    status: 'covered'
  },
  {
    id: 'users_import',
    category: 'Users',
    feature: 'Bulk import users via CSV',
    covered_by: 'import_users_csv',
    status: 'covered'
  },

  // ─── SETTINGS ─────────────────────────────────────────────────────────────
  {
    id: 'settings_view',
    category: 'Settings',
    feature: 'View system settings',
    covered_by: 'get_system_settings',
    status: 'covered'
  },
  {
    id: 'settings_update',
    category: 'Settings',
    feature: 'Update system settings',
    covered_by: 'update_system_settings',
    status: 'covered'
  },
  {
    id: 'permissions_list',
    category: 'Settings',
    feature: 'List all available permission strings',
    covered_by: 'get_available_permissions',
    status: 'covered'
  },

  // ─── DISPATCH ORDERS ──────────────────────────────────────────────────────
  {
    id: 'do_view',
    category: 'Dispatch',
    feature: 'View and filter dispatch orders',
    covered_by: 'query_dispatch_orders',
    status: 'covered'
  },
  {
    id: 'do_details',
    category: 'Dispatch',
    feature: 'Get dispatch order details with lines and movements',
    covered_by: 'get_dispatch_order_details',
    status: 'covered'
  },
  {
    id: 'do_create',
    category: 'Dispatch',
    feature: 'Create draft dispatch orders',
    covered_by: 'create_dispatch_order',
    status: 'covered'
  },
  {
    id: 'do_confirm',
    category: 'Dispatch',
    feature: 'Confirm dispatch orders (lock for dispatch)',
    covered_by: 'confirm_dispatch_order',
    status: 'covered'
  },
  {
    id: 'do_dispatch',
    category: 'Dispatch',
    feature: 'Execute dispatch (deduct stock via goods_issue movement)',
    covered_by: 'dispatch_items',
    status: 'covered'
  },
  {
    id: 'do_cancel',
    category: 'Dispatch',
    feature: 'Cancel dispatch orders',
    covered_by: 'cancel_dispatch_order',
    status: 'covered'
  },
  {
    id: 'do_archive',
    category: 'Dispatch',
    feature: 'Archive completed or cancelled dispatch orders',
    covered_by: null,
    status: 'gap',
    severity: 'low',
    recommendation: 'Add an archive_dispatch_order tool. The backend supports archiving DOs but no AI tool exposes it.'
  },
  {
    id: 'do_update',
    category: 'Dispatch',
    feature: 'Edit draft dispatch orders (header and lines)',
    covered_by: null,
    status: 'gap',
    severity: 'low',
    recommendation: 'Add an update_dispatch_order tool for editing draft DOs before confirmation.'
  },
  {
    id: 'do_stats',
    category: 'Dispatch',
    feature: 'View dispatch order summary statistics',
    covered_by: null,
    status: 'gap',
    severity: 'low',
    recommendation: 'Add a get_dispatch_stats tool. The backend exposes a /stats endpoint with DO counts by status.'
  },
  {
    id: 'do_export',
    category: 'Dispatch',
    feature: 'Export dispatch orders to CSV',
    covered_by: null,
    status: 'gap',
    severity: 'low',
    recommendation: 'Add an export_dispatch_orders tool. The backend supports CSV export of DOs.'
  },

  // ─── DATA MANAGEMENT ──────────────────────────────────────────────────────
  {
    id: 'export_csv',
    category: 'Data',
    feature: 'Export inventory data as CSV',
    covered_by: 'export_to_csv',
    status: 'covered'
  },
  {
    id: 'import_csv',
    category: 'Data',
    feature: 'Import inventory data from CSV',
    covered_by: 'import_csv_data',
    status: 'covered'
  },
  {
    id: 'search_docs',
    category: 'Data',
    feature: 'Search project documentation (RAG)',
    covered_by: 'search_documentation',
    status: 'covered'
  }
];

/**
 * Static knowledge gaps — things the AI structurally cannot know regardless of data.
 */
const STATIC_KNOWLEDGE_GAPS = [
  {
    id: 'company_context',
    description: 'AI does not know your company name, industry, or business context',
    severity: 'high'
  },
  {
    id: 'stock_baseline',
    description: 'AI has no historical baseline for anomaly detection — uses a moving window only, not long-term trends',
    severity: 'medium'
  },
  {
    id: 'online_users',
    description: 'AI cannot see which users are currently active or online',
    severity: 'low'
  },
  {
    id: 'subscription_plan',
    description: 'AI does not know your subscription plan or feature limits',
    severity: 'low'
  }
];

/**
 * Run a full diagnostics check for the current tenant.
 *
 * Phase 2: Returns static SYSTEM_FEATURE_MAP analysis + static knowledge gaps.
 * Phase 4 will add live tenant DB counts.
 *
 * @returns {Promise<Object>} Structured diagnostics report
 */
export const runDiagnostics = async () => {
  const coveredFeatures = SYSTEM_FEATURE_MAP.filter(f => f.status === 'covered');
  const gapFeatures     = SYSTEM_FEATURE_MAP.filter(f => f.status === 'gap');

  // Per-category coverage breakdown
  const byCategory = {};
  for (const feature of SYSTEM_FEATURE_MAP) {
    const cat = feature.category;
    if (!byCategory[cat]) byCategory[cat] = { total: 0, covered: 0 };
    byCategory[cat].total++;
    if (feature.status === 'covered') byCategory[cat].covered++;
  }

  const totalFeatures = SYSTEM_FEATURE_MAP.length;
  const coveredCount  = coveredFeatures.length;
  const coveragePct   = Math.round((coveredCount / totalFeatures) * 100);

  // Live tenant DB counts (with safe fallbacks)
  const tenantData = await fetchTenantData();

  // Dynamic knowledge gaps built from real tenant data
  const dynamicKnowledgeGaps = buildDynamicKnowledgeGaps(tenantData);
  const knowledgeGaps = [...STATIC_KNOWLEDGE_GAPS, ...dynamicKnowledgeGaps];

  return {
    generated_at: new Date().toISOString(),
    feature_coverage: {
      total_features: totalFeatures,
      covered: coveredCount,
      gaps: gapFeatures.length,
      coverage_pct: coveragePct,
      by_category: byCategory
    },
    tenant_data: tenantData,
    capability_gaps: gapFeatures.map(f => ({
      id:             f.id,
      category:       f.category,
      feature:        f.feature,
      severity:       f.severity,
      recommendation: f.recommendation
    })),
    knowledge_gaps: knowledgeGaps,
    covered_capabilities: coveredFeatures.map(f => ({
      id:       f.id,
      category: f.category,
      feature:  f.feature,
      tool:     f.covered_by
    }))
  };
};

/**
 * Fetch live tenant database counts using dbStore for tenant isolation.
 * All queries are read-only SELECT COUNT operations.
 * Failures are caught individually so one bad query never breaks the whole report.
 */
async function fetchTenantData() {
  const safeCount = async (modelName, options = {}) => {
    try {
      const Model = dbStore.get(modelName);
      if (!Model) return 0;
      return await Model.count(options);
    } catch {
      return 0;
    }
  };

  const [
    totalItems,
    activeItems,
    totalSuppliers,
    activeSuppliers,
    totalPOs,
    archivedPOs,
    totalJOs,
    archivedJOs,
    totalMovements,
    reportSnapshots,
    batchLineageRecords,
    removedUsers,
    totalDOs,
    archivedDOs
  ] = await Promise.all([
    safeCount('Item'),
    safeCount('Item', { where: buildVisibleWhere({ status: 'active' }) }),
    safeCount('Supplier'),
    safeCount('Supplier', { where: buildVisibleWhere({ status: 'active' }) }),
    safeCount('PurchaseOrder'),
    safeCount('PurchaseOrder', { where: { archived_at: { [Op.ne]: null } } }),
    safeCount('JobOrder'),
    safeCount('JobOrder', { where: { archived_at: { [Op.ne]: null } } }),
    safeCount('StockMovement'),
    safeCount('ReportSnapshot'),
    safeCount('BatchLineage'),
    safeCount('User', { where: { deleted_at: { [Op.ne]: null } } }),
    safeCount('DispatchOrder'),
    safeCount('DispatchOrder', { where: { archived_at: { [Op.ne]: null } } })
  ]);

  return {
    total_items:           totalItems,
    active_items:          activeItems,
    total_suppliers:       totalSuppliers,
    active_suppliers:      activeSuppliers,
    total_pos:             totalPOs,
    archived_pos:          archivedPOs,
    total_jos:             totalJOs,
    archived_jos:          archivedJOs,
    total_movements:       totalMovements,
    report_snapshots:      reportSnapshots,
    batch_lineage_records: batchLineageRecords,
    removed_users:         removedUsers,
    total_dos:             totalDOs,
    archived_dos:          archivedDOs
  };
}

/**
 * Build knowledge gap entries dynamically based on what tenant data actually exists
 * that the AI cannot access. Only adds entries when the data count is > 0.
 */
function buildDynamicKnowledgeGaps(tenantData) {
  const gaps = [];

  if (tenantData.archived_pos > 0) {
    gaps.push({
      id: 'archived_pos',
      description: `${tenantData.archived_pos} archived purchase order${tenantData.archived_pos > 1 ? 's are' : ' is'} inaccessible to the AI`,
      severity: 'low'
    });
  }

  if (tenantData.archived_jos > 0) {
    gaps.push({
      id: 'archived_jos',
      description: `${tenantData.archived_jos} archived job order${tenantData.archived_jos > 1 ? 's are' : ' is'} inaccessible to the AI`,
      severity: 'low'
    });
  }

  if (tenantData.report_snapshots > 0) {
    gaps.push({
      id: 'report_snapshots_data',
      description: `${tenantData.report_snapshots} saved report snapshot${tenantData.report_snapshots > 1 ? 's' : ''} cannot be retrieved by the AI`,
      severity: 'medium'
    });
  }

  if (tenantData.batch_lineage_records > 0) {
    gaps.push({
      id: 'batch_lineage_data',
      description: `${tenantData.batch_lineage_records} batch lineage record${tenantData.batch_lineage_records > 1 ? 's' : ''} (traceability data) are not queryable by the AI`,
      severity: 'low'
    });
  }

  if (tenantData.removed_users > 0) {
    gaps.push({
      id: 'removed_users_data',
      description: `${tenantData.removed_users} removed user${tenantData.removed_users > 1 ? 's' : ''} exist but the AI cannot view their records`,
      severity: 'low'
    });
  }

  if (tenantData.archived_dos > 0) {
    gaps.push({
      id: 'archived_dos',
      description: `${tenantData.archived_dos} archived dispatch order${tenantData.archived_dos > 1 ? 's are' : ' is'} inaccessible to the AI`,
      severity: 'low'
    });
  }

  return gaps;
}

export default { runDiagnostics };
