/**
 * AI Tool Executor
 *
 * Executes AI tool calls by mapping them to existing backend services.
 * This provides a bridge between OpenAI function calling and the
 * actual business logic in the inventory system.
 */

import logger from '../config/logger.js';

// Import existing services
import * as itemService from './itemService.js';
import * as supplierService from './supplierService.js';
import * as purchaseOrderService from './purchaseOrderService.js';
import * as jobOrderService from './jobOrderService.js';
import * as stockMovementService from './stockMovementService.js';
import * as dashboardService from './dashboardService.js';
import * as alertService from './alertService.js';
import * as forecastService from './forecastService.js';

/**
 * Execute a tool by name with given arguments
 * @param {string} toolName - Name of the tool to execute
 * @param {Object} args - Arguments for the tool
 * @param {Object} user - User executing the tool
 * @returns {Promise<Object>} Tool execution result
 */
export const execute = async (toolName, args, user) => {
  logger.info(`Executing AI tool: ${toolName}`, { args, userId: user.user_id });

  try {
    switch (toolName) {
      // ============== DASHBOARD & STATS ==============
      case 'get_dashboard_stats':
        return await getDashboardStats();

      case 'get_low_stock_items':
        return await getLowStockItems(args);

      // ============== ITEMS ==============
      case 'get_items':
        return await getItems(args);

      case 'get_item_details':
        return await getItemDetails(args);

      case 'create_item':
        return await createItem(args, user);

      case 'update_item':
        return await updateItem(args, user);

      case 'delete_item':
        return await deleteItem(args, user);

      // ============== SUPPLIERS ==============
      case 'get_suppliers':
        return await getSuppliers(args);

      case 'get_supplier_details':
        return await getSupplierDetails(args);

      // ============== PURCHASE ORDERS ==============
      case 'get_purchase_orders':
        return await getPurchaseOrders(args);

      case 'create_purchase_order':
        return await createPurchaseOrder(args, user);

      case 'receive_purchase_order':
        return await receivePurchaseOrder(args, user);

      // ============== JOB ORDERS ==============
      case 'get_job_orders':
        return await getJobOrders(args);

      case 'create_job_order':
        return await createJobOrder(args, user);

      case 'complete_job_order':
        return await completeJobOrder(args, user);

      // ============== STOCK MOVEMENTS ==============
      case 'get_stock_movements':
        return await getStockMovements(args);

      case 'create_stock_adjustment':
        return await createStockAdjustment(args, user);

      // ============== ALERTS & FORECASTING ==============
      case 'get_expiry_alerts':
        return await getExpiryAlerts(args);

      case 'get_forecast':
        return await getForecast(args);

      // ============== DOCUMENTATION (RAG) ==============
      case 'search_documentation':
        return await searchDocumentation(args);

      // ============== PRODUCTION FEASIBILITY ==============
      case 'analyze_production_feasibility':
        return await analyzeProductionFeasibility(args);

      // ============== CSV IMPORT/EXPORT ==============
      case 'import_csv_data':
        return await importCsvData(args, user);

      case 'export_to_csv':
        return await exportToCsv(args, user);

      default:
        throw new Error(`Unknown tool: ${toolName}`);
    }
  } catch (error) {
    logger.error(`Tool execution failed: ${toolName}`, error);
    throw error;
  }
};

// ============== DASHBOARD & STATS ==============

async function getDashboardStats() {
  const stats = await dashboardService.getDashboardStats();
  return {
    total_items: stats.totalItems,
    low_stock_count: stats.lowStockCount,
    healthy_stock_count: stats.healthyCount,
    overstock_count: stats.overStockCount,
    pending_purchase_orders: stats.pending_purchase_orders,
    active_job_orders: stats.active_job_orders,
    total_inventory_value: stats.totalValue
  };
}

async function getLowStockItems({ limit = 20 }) {
  const items = await dashboardService.getLowStockItems();
  return {
    count: items.length,
    items: items.slice(0, limit).map(item => ({
      id: item.item_id,
      sku_code: item.sku_code,
      name: item.name,
      category: item.category,
      current_stock: item.current_stock,
      min_threshold: item.min_threshold,
      shortage: (item.min_threshold || 0) - (item.current_stock || 0),
      unit: item.unit_of_measure
    }))
  };
}

// ============== ITEMS ==============

async function getItems(args) {
  const { search, category, status = 'active', stock_status, limit = 50, page = 1 } = args;

  const result = await itemService.getItems({
    search,
    category,
    status,
    limit,
    page
  });

  return {
    count: result.items.length,
    total: result.total,
    page: result.page,
    items: result.items.map(formatItem)
  };
}

async function getItemDetails({ item_id, sku_code }) {
  let item;
  if (item_id) {
    item = await itemService.getItemById(item_id);
  } else if (sku_code) {
    // Search for item by SKU
    const result = await itemService.getItems({ search: sku_code, limit: 1 });
    item = result.items?.[0];
  } else {
    throw new Error('Please provide either item_id or sku_code');
  }

  if (!item) {
    throw new Error('Item not found');
  }

  // Get additional details
  const [batches, movements] = await Promise.all([
    itemService.getItemBatches(item.item_id),
    itemService.getItemStockHistory(item.item_id, { limit: 10 })
  ]);

  return {
    ...formatItem(item),
    batches: batches.map(b => ({
      batch_id: b.batch_id,
      quantity: b.quantity,
      cost_per_unit: b.cost_per_unit,
      received_date: b.received_date,
      expiry_date: b.expiry_date,
      quantity_consumed: b.quantity_consumed
    })),
    recent_movements: movements.map(m => ({
      type: m.movement_type,
      quantity: m.quantity,
      date: m.timestamp,
      reference: m.reference_id
    }))
  };
}

async function createItem(args, user) {
  const itemData = {
    sku_code: args.sku_code,
    name: args.name,
    category: args.category,
    product_type: args.product_type,
    description: args.description,
    max_capacity: args.max_capacity,
    unit_of_measure: args.unit_of_measure,
    cost_per_unit: args.cost_per_unit || 0,
    fifo_enabled: args.fifo_enabled !== false,
    status: 'active'
  };

  const item = await itemService.createItem(itemData, user.user_id);
  return {
    success: true,
    message: `Item "${item.name}" created successfully`,
    item: formatItem(item)
  };
}

async function updateItem(args, user) {
  const { item_id, ...updates } = args;
  const item = await itemService.updateItem(item_id, updates, user.user_id);
  return {
    success: true,
    message: `Item updated successfully`,
    item: formatItem(item)
  };
}

async function deleteItem({ item_id, reason }, user) {
  await itemService.deleteItem(item_id, user.user_id, reason);
  return {
    success: true,
    message: `Item ${item_id} has been soft-deleted`,
    note: 'The item can be restored by an administrator if needed'
  };
}

// ============== SUPPLIERS ==============

async function getSuppliers({ search, status = 'active', limit = 50 }) {
  const result = await supplierService.getSuppliers({
    search,
    status,
    limit
  });

  return {
    count: result.length,
    suppliers: result.map(s => ({
      id: s.supplier_id,
      name: s.name,
      contact_person: s.contact_person,
      email: s.email,
      phone: s.phone,
      quality_rating: s.quality_rating,
      avg_delivery_days: s.avg_delivery_days
    }))
  };
}

async function getSupplierDetails({ supplier_id }) {
  const supplier = await supplierService.getSupplierById(supplier_id);
  if (!supplier) {
    throw new Error('Supplier not found');
  }

  return {
    ...supplier,
    items_supplied: supplier.SupplierItems?.map(si => ({
      item_id: si.item_id,
      item_name: si.Item?.name,
      price_per_unit: si.price_per_unit,
      moq: si.moq
    })) || []
  };
}

// ============== PURCHASE ORDERS ==============

async function getPurchaseOrders({ status, supplier_id, date_from, date_to, limit = 50 }) {
  const result = await purchaseOrderService.getPurchaseOrders({
    status,
    supplier_id,
    startDate: date_from,
    endDate: date_to,
    limit
  });

  return {
    count: result.length,
    purchase_orders: result.map(po => ({
      po_id: po.po_id,
      po_number: po.po_number,
      supplier_name: po.Supplier?.name,
      status: po.status,
      order_date: po.order_date,
      expected_delivery_date: po.expected_delivery_date,
      total_amount: po.total_amount,
      items_count: po.POLineItems?.length || 0
    }))
  };
}

async function createPurchaseOrder(args, user) {
  const poData = {
    supplier_id: args.supplier_id,
    expected_delivery_date: args.expected_delivery_date,
    notes: args.notes,
    line_items: args.items.map(item => ({
      item_id: item.item_id,
      quantity: item.quantity,
      unit_price: item.unit_price
    }))
  };

  const po = await purchaseOrderService.createPurchaseOrder(poData, user.user_id);
  return {
    success: true,
    message: `Purchase Order ${po.po_number} created successfully`,
    po_id: po.po_id,
    po_number: po.po_number,
    total_amount: po.total_amount
  };
}

async function receivePurchaseOrder({ po_id, received_items }, user) {
  const result = await purchaseOrderService.receivePurchaseOrder(
    po_id,
    received_items,
    user.user_id
  );

  return {
    success: true,
    message: `Purchase Order received successfully`,
    po_id,
    batches_created: result.batchesCreated,
    items_received: result.itemsReceived
  };
}

// ============== JOB ORDERS ==============

async function getJobOrders({ status, product_id, limit = 50 }) {
  const result = await jobOrderService.getJobOrders({
    status,
    limit
  });

  return {
    count: result.length,
    job_orders: result.map(jo => ({
      jo_id: jo.jo_id,
      jo_number: jo.jo_number,
      product_name: jo.Product?.name,
      quantity_to_produce: jo.quantity_to_produce,
      quantity_produced: jo.quantity_produced,
      status: jo.status,
      responsible_user: jo.ResponsibleUser?.username
    }))
  };
}

async function createJobOrder(args, user) {
  const joData = {
    product_id: args.product_id,
    quantity_to_produce: args.quantity_to_produce,
    notes: args.notes
  };

  const jo = await jobOrderService.createJobOrder(joData, user.user_id);
  return {
    success: true,
    message: `Job Order ${jo.jo_number} created successfully`,
    jo_id: jo.jo_id,
    jo_number: jo.jo_number,
    ingredients_reserved: jo.ingredientsReserved
  };
}

async function completeJobOrder({ jo_id, quantity_produced, expiry_date }, user) {
  const result = await jobOrderService.completeJobOrder(
    jo_id,
    user.user_id,
    expiry_date,       // expiryDateOverride
    null,              // notes
    quantity_produced  // quantityProduced
  );

  return {
    success: true,
    message: `Job Order completed successfully`,
    jo_id,
    quantity_produced,
    batch_created: result.batchId,
    ingredients_consumed: result.ingredientsConsumed
  };
}

// ============== STOCK MOVEMENTS ==============

async function getStockMovements({ item_id, movement_type, date_from, date_to, limit = 50 }) {
  const result = await stockMovementService.getStockMovements({
    item_id,
    movement_type,
    startDate: date_from,
    endDate: date_to,
    limit
  });

  // Handle both array result and object with movements property
  const movements = Array.isArray(result) ? result : (result.movements || []);

  return {
    count: movements.length,
    movements: movements.map(m => ({
      movement_id: m.movement_id,
      item_name: m.item?.name,
      movement_type: m.movement_type,
      quantity: m.quantity,
      reference: m.reference_id,
      reference_type: m.reference_type,
      timestamp: m.timestamp,
      created_by: m.userResponsible?.username
    }))
  };
}

async function createStockAdjustment(args, user) {
  const movementData = {
    item_id: args.item_id,
    quantity: args.quantity,
    movement_type: args.movement_type,
    notes: args.reason,
    batch_id: args.batch_id
  };

  const movement = await stockMovementService.createStockMovement(movementData, user.user_id);
  return {
    success: true,
    message: `Stock adjustment recorded successfully`,
    movement_id: movement.movement_id,
    new_stock_level: movement.newStockLevel
  };
}

// ============== ALERTS & FORECASTING ==============

async function getExpiryAlerts({ critical_days = 7, warning_days = 30 }) {
  const alerts = await alertService.getExpiryAlerts({
    criticalDays: critical_days,
    warningDays: warning_days
  });

  return {
    critical_count: alerts.critical?.length || 0,
    warning_count: alerts.warning?.length || 0,
    critical: alerts.critical?.map(a => ({
      item_name: a.item_name,
      batch_id: a.batch_id,
      expiry_date: a.expiry_date,
      days_until_expiry: a.days_until_expiry,
      quantity: a.quantity
    })) || [],
    warning: alerts.warning?.map(a => ({
      item_name: a.item_name,
      batch_id: a.batch_id,
      expiry_date: a.expiry_date,
      days_until_expiry: a.days_until_expiry,
      quantity: a.quantity
    })) || []
  };
}

async function getForecast({ item_id, days = 30 }) {
  const forecast = await forecastService.getStockForecast({
    itemId: item_id,
    days
  });

  return {
    forecast_days: days,
    items: forecast.map(f => ({
      item_id: f.item_id,
      item_name: f.item_name,
      current_stock: f.current_stock,
      daily_consumption_rate: f.daily_consumption_rate,
      projected_stock: f.projected_stock,
      days_until_stockout: f.days_until_stockout,
      status: f.status
    }))
  };
}

// ============== DOCUMENTATION (RAG) ==============

async function searchDocumentation({ query }) {
  // This will be implemented in Phase 4 (RAG)
  // For now, return a placeholder
  return {
    message: 'Documentation search will be available soon.',
    query,
    results: []
  };
}

// ============== PRODUCTION FEASIBILITY ==============

async function analyzeProductionFeasibility({ product_id, include_partial = true, show_chain = true }) {
  // This will be implemented in Phase 7
  // For now, return a placeholder
  return {
    message: 'Production feasibility analysis will be available soon.',
    product_id,
    include_partial,
    show_chain
  };
}

// ============== CSV IMPORT/EXPORT ==============

async function importCsvData({ entity_type, csv_content, options }, user) {
  // This will be implemented in Phase 9
  // For now, return a placeholder
  return {
    message: 'CSV import will be available soon.',
    entity_type,
    preview: 'Parsing...',
    options
  };
}

async function exportToCsv({ entity_type, filters, output_preference }, user) {
  // This will be implemented in Phase 9
  // For now, return a placeholder
  return {
    message: 'CSV export will be available soon.',
    entity_type,
    filters,
    output_preference
  };
}

// ============== HELPER FUNCTIONS ==============

function formatItem(item) {
  return {
    id: item.item_id,
    sku_code: item.sku_code,
    name: item.name,
    category: item.category,
    product_type: item.product_type,
    description: item.description,
    current_stock: item.current_stock,
    max_capacity: item.max_capacity,
    min_threshold: item.min_threshold,
    purchase_allowance: item.purchase_allowance,
    unit: item.unit_of_measure,
    cost_per_unit: item.cost_per_unit,
    fifo_enabled: item.fifo_enabled,
    status: item.status,
    stock_status: getStockStatus(item)
  };
}

function getStockStatus(item) {
  const current = parseFloat(item.current_stock) || 0;
  const min = parseFloat(item.min_threshold) || 0;
  const max = parseFloat(item.max_capacity) || 0;

  if (current <= min) return 'low';
  if (current > max) return 'overstock';
  return 'healthy';
}

export default {
  execute
};
