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
import * as csvImportService from './csvImportService.js';
import * as csvExportService from './csvExportService.js';
import * as analyticsService from './analyticsService.js';
import db from '../models/index.js'; // For raw queries if needed for stats
import * as dashboardService from './dashboardService.js';
import * as alertService from './alertService.js';
import * as forecastService from './forecastService.js';
import * as documentationService from './documentationService.js';
import * as productionFeasibilityService from './productionFeasibilityService.js';
import * as tempFileService from './tempFileService.js';

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
      // Production Feasibility
      case 'analyze_production_feasibility':
        if (args.product_id) {
          return await jobOrderService.checkProductionFeasibility(args.product_id, 1, args.show_chain !== false);
        } else if (args.product_ids) {
          // Check multiple products
          const results = [];
          for (const pid of args.product_ids) {
            results.push(await jobOrderService.checkProductionFeasibility(pid, 1, args.show_chain !== false));
          }
          return results;
        } else {
          // If no specific product, list all products that CAN be produced right now
          throw new Error("Please specify a product_id or list of product_ids to check feasibility for.");
        }

      // Smart Reorder Analytics (Phase 5)
      case 'analyze_reorder_needs':
        if (args.item_id) {
          return await analyticsService.calculateReorderPoint(args.item_id);
        } else {
          return await analyticsService.getReorderRecommendations(args.category);
        }

      // Anomaly Detection (Phase 6)
      case 'detect_anomalies':
        return await analyticsService.detectAnomalies({
          category: args.category,
          days: 30 // Default lookback
        });

      // Advanced Analytics (Phase 7)
      case 'get_advanced_analytics':
        if (args.analysis_type === 'supplier_performance') {
          if (!args.target_id) throw new Error("target_id (Supplier ID) is required for supplier performance analysis");
          return await analyticsService.analyzeSupplierPerformance(args.target_id);
        } else if (args.analysis_type === 'cost_analysis') {
          return await analyticsService.analyzeInventoryCosts({
            startDate: args.date_range?.start,
            endDate: args.date_range?.end
          });
        }
        break;

      // CSV Import/Export
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
  const results = await documentationService.searchDocumentation(query);

  if (results.length === 0) {
    // Try contextual help as fallback
    const help = await documentationService.getContextualHelp(query);
    return {
      query,
      results: [],
      contextual_help: help
    };
  }

  return {
    query,
    results: results.map(r => ({
      title: r.title,
      description: r.description,
      relevance: r.score > 10 ? 'high' : r.score > 5 ? 'medium' : 'low',
      excerpt: r.excerpt
    }))
  };
}

// ============== PRODUCTION FEASIBILITY ==============


async function analyzeProductionFeasibility({ product_id, include_partial = true, show_chain = true }) {
  try {
    // If specific product requested, analyze its production chain
    if (product_id) {
      const chainAnalysis = await productionFeasibilityService.analyzeProductionChain(product_id, 1);

      if (!chainAnalysis.success) {
        return { error: chainAnalysis.error };
      }

      const { product, productionChain, rawMaterialRequirements, stockAvailability, shortages } = chainAnalysis.data;

      return {
        product: {
          id: product.id,
          name: product.name,
          sku_code: product.skuCode,
          nesting_level: product.nestingLevel
        },
        can_produce: stockAvailability.allAvailable,
        max_producible: stockAvailability.maxProducible,
        production_chain: show_chain ? formatProductionChain(productionChain) : null,
        max_producible: stockAvailability.maxProducible,
        production_chain: show_chain ? formatProductionChain(productionChain) : null,
        raw_materials: rawMaterialRequirements.map(rm => ({
          id: rm.itemId,
          name: rm.name,
          sku_code: rm.skuCode,
          category: rm.category,
          required: rm.requiredQuantity,
          available: rm.availableStock,
          unit: rm.unit,
          has_shortage: rm.shortage > 0,
          shortage: rm.shortage
        })),
        shortages: shortages.map(s => ({
          name: s.name,
          required: s.required,
          available: s.available,
          shortage: s.shortage,
          unit: s.unit
        })),
        message: stockAvailability.allAvailable
          ? `Can produce ${product.name}. All ${stockAvailability.totalIngredients} ingredients available.`
          : `Cannot produce ${product.name}. Missing ${shortages.length} ingredient(s).`
      };
    }

    // Get all producible products
    const result = await productionFeasibilityService.getProducibleProducts({
      limit: 50
    });

    if (!result.success) {
      return { error: 'Failed to analyze production feasibility' };
    }

    const { fullyProducible, partiallyProducible, notProducible, noRecipe } = result.data;
    const { summary } = result;

    // Build response
    const response = {
      summary: {
        total_products: summary.totalProducts,
        fully_producible: summary.fullyProducible,
        partially_producible: summary.partiallyProducible,
        not_producible: summary.notProducible,
        no_recipe: summary.noRecipe
      },
      fully_producible: fullyProducible.slice(0, 10).map(p => ({
        id: p.productId,
        name: p.productName,
        sku_code: p.skuCode,
        product_type: p.productType,
        nesting_level: p.nestingLevel,
        max_producible: p.maxProducible,
        message: p.message
      })),
      message: `Found ${summary.fullyProducible} product(s) that can be fully produced, ${summary.partiallyProducible} partially producible, and ${summary.notProducible} that cannot be produced due to ingredient shortages.`
    };

    // Include partially producible if requested
    if (include_partial && partiallyProducible.length > 0) {
      response.partially_producible = partiallyProducible.slice(0, 5).map(p => ({
        id: p.productId,
        name: p.productName,
        sku_code: p.skuCode,
        max_producible: p.maxProducible,
        bottleneck: p.bottleneck
      }));
    }

    return response;
  } catch (error) {
    logger.error('Error in analyzeProductionFeasibility:', error);
    return { error: error.message || 'Failed to analyze production feasibility' };
  }
}

// Helper to format production chain for display
function formatProductionChain(chain, indent = 0) {
  const prefix = '  '.repeat(indent);
  let result = `${prefix}${chain.productName} (x${chain.quantity})`;

  if (chain.subProducts && chain.subProducts.length > 0) {
    result += '\n' + prefix + '  Sub-products needed:';
    for (const sub of chain.subProducts) {
      result += '\n' + formatProductionChain(sub, indent + 2);
      if (sub.needsToProduce > 0) {
        result += ` [NEED TO PRODUCE: ${sub.needsToProduce}]`;
      }
    }
  }

  return result;
}

// ============== CSV IMPORT/EXPORT ==============

async function importCsvData({ entity_type, csv_content, options = {} }, user) {
  try {
    // Parse the CSV content
    const parsed = tempFileService.parseCsv(csv_content);

    if (parsed.error) {
      return { error: parsed.error };
    }

    // Define required fields based on entity type
    const requiredFields = {
      items: ['sku_code', 'name', 'category', 'max_capacity', 'unit_of_measure'],
      suppliers: ['name', 'contact_person', 'email']
    };

    const required = requiredFields[entity_type] || [];

    // Validate structure
    const validation = tempFileService.validateCsvStructure(parsed, required);

    if (!validation.valid) {
      return {
        success: false,
        error: 'Validation failed',
        validation_errors: validation.errors,
        parse_errors: validation.parseErrors,
        summary: validation.summary
      };
    }

    // Return preview for confirmation
    return {
      success: true,
      requires_confirmation: true,
      entity_type,
      preview: {
        headers: parsed.headers,
        sample_rows: parsed.rows.slice(0, 5),
        total_rows: parsed.totalRows
      },
      summary: validation.summary,
      options: {
        skip_duplicates: options.skip_duplicates !== false,
        update_existing: options.update_existing === true
      },
      message: `Ready to import ${parsed.totalRows} ${entity_type}. Please confirm to proceed.`
    };
  } catch (error) {
    logger.error('Error in importCsvData:', error);
    return { error: error.message || 'Failed to parse CSV content' };
  }
}

async function exportToCsv({ entity_type, filters = {}, output_preference = 'ask_user' }, user) {
  try {
    let data = [];
    let columns = [];
    let filename = '';

    // Fetch data based on entity type
    switch (entity_type) {
      case 'items': {
        const result = await itemService.getItems({
          category: filters.category,
          status: filters.status || 'active',
          limit: 1000
        });
        data = result.items || result.data?.items || [];
        columns = [
          { key: 'sku_code', label: 'SKU Code' },
          { key: 'name', label: 'Name' },
          { key: 'category', label: 'Category' },
          { key: 'current_stock', label: 'Current Stock' },
          { key: 'max_capacity', label: 'Max Capacity' },
          { key: 'min_threshold', label: 'Min Threshold' },
          { key: 'unit_of_measure', label: 'Unit' },
          { key: 'cost_per_unit', label: 'Cost/Unit' },
          { key: 'status', label: 'Status' }
        ];
        filename = `items_export_${new Date().toISOString().split('T')[0]}.csv`;
        break;
      }

      case 'suppliers': {
        const result = await supplierService.getSuppliers({
          status: filters.status || 'active',
          limit: 500
        });
        data = result.suppliers || result.data?.suppliers || [];
        columns = [
          { key: 'name', label: 'Name' },
          { key: 'contact_person', label: 'Contact Person' },
          { key: 'email', label: 'Email' },
          { key: 'phone', label: 'Phone' },
          { key: 'address', label: 'Address' },
          { key: 'quality_rating', label: 'Quality Rating' },
          { key: 'lead_time', label: 'Lead Time (days)' },
          { key: 'status', label: 'Status' }
        ];
        filename = `suppliers_export_${new Date().toISOString().split('T')[0]}.csv`;
        break;
      }

      case 'purchase_orders': {
        const result = await purchaseOrderService.getPurchaseOrders({
          status: filters.status,
          startDate: filters.date_from,
          endDate: filters.date_to,
          limit: 500
        });
        data = (result.purchaseOrders || result.data?.purchaseOrders || []).map(po => ({
          po_number: po.po_number,
          supplier_name: po.supplier?.name || po.Supplier?.name || '',
          status: po.status,
          total_amount: po.total_amount,
          expected_delivery: po.expected_delivery,
          created_at: po.created_at
        }));
        columns = [
          { key: 'po_number', label: 'PO Number' },
          { key: 'supplier_name', label: 'Supplier' },
          { key: 'status', label: 'Status' },
          { key: 'total_amount', label: 'Total Amount' },
          { key: 'expected_delivery', label: 'Expected Delivery' },
          { key: 'created_at', label: 'Created At' }
        ];
        filename = `purchase_orders_export_${new Date().toISOString().split('T')[0]}.csv`;
        break;
      }

      case 'job_orders': {
        const result = await jobOrderService.getJobOrders({
          status: filters.status,
          limit: 500
        });
        data = (result.jobOrders || result.data?.jobOrders || []).map(jo => ({
          jo_number: jo.jo_number,
          product_name: jo.product?.name || jo.Product?.name || '',
          quantity_to_produce: jo.quantity_to_produce,
          quantity_produced: jo.quantity_produced,
          status: jo.status,
          created_at: jo.created_at
        }));
        columns = [
          { key: 'jo_number', label: 'JO Number' },
          { key: 'product_name', label: 'Product' },
          { key: 'quantity_to_produce', label: 'Qty to Produce' },
          { key: 'quantity_produced', label: 'Qty Produced' },
          { key: 'status', label: 'Status' },
          { key: 'created_at', label: 'Created At' }
        ];
        filename = `job_orders_export_${new Date().toISOString().split('T')[0]}.csv`;
        break;
      }

      case 'stock_movements': {
        const result = await stockMovementService.getStockMovements({
          item_id: filters.item_id,
          startDate: filters.date_from,
          endDate: filters.date_to,
          limit: 1000
        });
        data = (result.movements || result.data?.movements || []).map(m => ({
          movement_id: m.movement_id,
          item_name: m.item?.name || m.Item?.name || '',
          movement_type: m.movement_type,
          quantity: m.quantity,
          reference_type: m.reference_type,
          reference_id: m.reference_id,
          created_by: m.userResponsible?.username || '',
          created_at: m.created_at
        }));
        columns = [
          { key: 'movement_id', label: 'Movement ID' },
          { key: 'item_name', label: 'Item' },
          { key: 'movement_type', label: 'Type' },
          { key: 'quantity', label: 'Quantity' },
          { key: 'reference_type', label: 'Reference Type' },
          { key: 'reference_id', label: 'Reference ID' },
          { key: 'created_by', label: 'Created By' },
          { key: 'created_at', label: 'Created At' }
        ];
        filename = `stock_movements_export_${new Date().toISOString().split('T')[0]}.csv`;
        break;
      }

      default:
        return { error: `Export not supported for entity type: ${entity_type}` };
    }

    if (data.length === 0) {
      return {
        success: true,
        message: `No ${entity_type} found matching the specified filters.`,
        total_records: 0
      };
    }

    // Generate CSV content
    const csvContent = tempFileService.generateCsv(data, columns);

    // Handle output preference
    if (output_preference === 'display') {
      // Return content directly for display in chat
      const displayRows = data.slice(0, 10);
      return {
        success: true,
        output_mode: 'display',
        entity_type,
        total_records: data.length,
        preview: {
          headers: columns.map(c => c.label),
          rows: displayRows.map(row => columns.map(c => row[c.key] || '')),
          showing: displayRows.length,
          total: data.length
        },
        message: `Showing first ${displayRows.length} of ${data.length} records.${data.length > 10 ? ' Use download option for full data.' : ''}`
      };
    }

    if (output_preference === 'download') {
      // Store file and return download link
      const fileInfo = await tempFileService.storeTemporaryFile(
        csvContent,
        filename,
        user.user_id
      );

      return {
        success: true,
        output_mode: 'download',
        entity_type,
        total_records: data.length,
        download: {
          url: fileInfo.downloadUrl,
          filename: fileInfo.filename,
          expires_at: fileInfo.expiresAt,
          expires_in: fileInfo.expiresIn
        },
        message: `Export ready! ${data.length} records exported. Download link valid for 1 hour.`
      };
    }

    // Default: ask user preference
    return {
      success: true,
      output_mode: 'ask_preference',
      entity_type,
      total_records: data.length,
      message: `Ready to export ${data.length} ${entity_type}. How would you like to receive the data?`,
      options: [
        { value: 'display', label: 'Display in chat (first 10 rows)' },
        { value: 'download', label: 'Generate download link' }
      ]
    };

  } catch (error) {
    logger.error('Error in exportToCsv:', error);
    return { error: error.message || 'Failed to export data' };
  }
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
