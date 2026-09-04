import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { Op } from 'sequelize';
import dbStore from '../utils/dbStore.js';
import { buildVisibleWhere } from '../utils/softDeletePolicy.js';
import { getItemsCostMetrics, getWeightedInventoryValueOverview } from '../modules/inventory/services/costValuationService.js';
import { buildStockBearingItemWhere } from '../modules/shared/utils/stockBearingPolicy.js';

const toNumberOrZero = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const round4 = (value) => Math.round(toNumberOrZero(value) * 10000) / 10000;

const toVariancePercent = (actualValue, baselineValue) => (
  baselineValue > 0 ? ((actualValue - baselineValue) / baselineValue) * 100 : null
);

const resolveVarianceBaselineSource = (metrics = null) => {
  if (metrics?.scoped?.source === 'fifo_batches') {
    return 'location_weighted_avg_cost';
  }
  if (metrics?.global?.source === 'fifo_batches') {
    return 'global_weighted_avg_cost';
  }
  return 'item_cost_fallback';
};

// ============================================
// EXPIRY REPORT (P0 Priority)
// ============================================

/**
 * Get comprehensive expiry report with expired and expiring batches
 * @param {Object} filters - { startDate, endDate } for filtering
 */
export const getExpiryReport = async (filters = {}) => {
  const FIFOBatch = dbStore.get('FIFOBatch');
  const Item = dbStore.get('Item');
  const TenantLocation = dbStore.get('TenantLocation');
  const sequelize = dbStore.getStore()?.sequelize || dbStore.get('sequelize');
  const locationId = Number.parseInt(filters.location_id, 10);
  const hasLocationFilter = Number.isInteger(locationId) && locationId > 0;

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Define tier thresholds
  const criticalDays = 7;
  const warningDays = 14;
  const upcomingDays = 30;

  const criticalDate = new Date(today);
  criticalDate.setDate(criticalDate.getDate() + criticalDays);

  const warningDate = new Date(today);
  warningDate.setDate(warningDate.getDate() + warningDays);

  const upcomingDate = new Date(today);
  upcomingDate.setDate(upcomingDate.getDate() + upcomingDays);

  // Build date filter for when batches were received (for historical filtering)
  const receivedDateFilter = {};
  if (filters.startDate) {
    receivedDateFilter[Op.gte] = filters.startDate;
  }
  if (filters.endDate) {
    receivedDateFilter[Op.lte] = filters.endDate;
  }

  // Get all batches with remaining quantity
  const allBatches = await FIFOBatch.findAll({
    where: {
      expiry_date: { [Op.ne]: null },
      ...(Object.keys(receivedDateFilter).length > 0 && { received_date: receivedDateFilter }),
      ...(hasLocationFilter && { location_id: locationId }),
      [Op.and]: [
        sequelize.where(
          sequelize.col('quantity'),
          Op.gt,
          sequelize.col('quantity_consumed')
        )
      ]
    },
    include: [
      {
        model: Item,
        as: 'item',
        where: buildStockBearingItemWhere(buildVisibleWhere({ status: 'active' })),
        attributes: ['item_id', 'name', 'sku_code', 'unit_of_measure', 'cost_per_unit', 'category', 'mode_item_preset']
      },
      {
        model: TenantLocation,
        as: 'location',
        required: false,
        attributes: ['location_id', 'name']
      }
    ],
    order: [['expiry_date', 'ASC']]
  });

  // Categorize batches
  const expired = [];
  const critical = [];
  const warning = [];
  const upcoming = [];

  let totalExpiredValue = 0;
  let totalCriticalValue = 0;
  let totalWarningValue = 0;
  let totalUpcomingValue = 0;

  allBatches.forEach(batch => {
    if (!batch.item) return;

    const expiryDate = new Date(batch.expiry_date);
    if (isNaN(expiryDate.getTime()) || expiryDate.getFullYear() < 2000) return;

    const daysUntilExpiry = Math.ceil((expiryDate - today) / (1000 * 60 * 60 * 24));
    const availableQty = parseFloat(batch.quantity) - parseFloat(batch.quantity_consumed);
    const costPerUnit = parseFloat(batch.cost_per_unit || batch.item.cost_per_unit) || 0;
    const valueAtRisk = availableQty * costPerUnit;

    const batchData = {
      batch_id: batch.batch_id,
      item_id: batch.item_id,
      item_name: batch.item.name,
      sku_code: batch.item.sku_code,
      category: batch.item.category,
      expiry_date: batch.expiry_date,
      days_until_expiry: daysUntilExpiry,
      available_quantity: availableQty,
      unit_of_measure: batch.item.unit_of_measure,
      cost_per_unit: costPerUnit,
      value_at_risk: valueAtRisk,
      received_date: batch.received_date,
      po_number: batch.po_number,
      location_id: batch.location_id || null,
      location_name: batch.location?.name || null
    };

    if (daysUntilExpiry < 0) {
      expired.push({ ...batchData, days_expired: Math.abs(daysUntilExpiry) });
      totalExpiredValue += valueAtRisk;
    } else if (daysUntilExpiry <= criticalDays) {
      critical.push(batchData);
      totalCriticalValue += valueAtRisk;
    } else if (daysUntilExpiry <= warningDays) {
      warning.push(batchData);
      totalWarningValue += valueAtRisk;
    } else if (daysUntilExpiry <= upcomingDays) {
      upcoming.push(batchData);
      totalUpcomingValue += valueAtRisk;
    }
  });

  return {
    summary: {
      total_expired_batches: expired.length,
      total_critical_batches: critical.length,
      total_warning_batches: warning.length,
      total_upcoming_batches: upcoming.length,
      total_expired_value: totalExpiredValue,
      total_critical_value: totalCriticalValue,
      total_warning_value: totalWarningValue,
      total_upcoming_value: totalUpcomingValue,
      total_value_at_risk: totalExpiredValue + totalCriticalValue + totalWarningValue + totalUpcomingValue,
      generated_at: new Date().toISOString()
    },
    expired,
    critical,
    warning,
    upcoming
  };
};

// ============================================
// ENHANCED STOCK AGING REPORT (P1 Priority)
// ============================================

/**
 * Get batch-level stock aging report with turnover calculation
 */
export const getEnhancedStockAgingReport = async (filters = {}) => {
  const FIFOBatch = dbStore.get('FIFOBatch');
  const Item = dbStore.get('Item');
  const TenantLocation = dbStore.get('TenantLocation');
  const sequelize = dbStore.getStore()?.sequelize || dbStore.get('sequelize');
  const locationId = Number.parseInt(filters.location_id, 10);
  const hasLocationFilter = Number.isInteger(locationId) && locationId > 0;

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Build date filter
  const dateFilter = {};
  if (filters.startDate) {
    dateFilter[Op.gte] = filters.startDate;
  }
  if (filters.endDate) {
    dateFilter[Op.lte] = filters.endDate;
  }

  const batches = await FIFOBatch.findAll({
    where: {
      ...(Object.keys(dateFilter).length > 0 && { received_date: dateFilter }),
      ...(hasLocationFilter && { location_id: locationId }),
      [Op.and]: [
        sequelize.where(
          sequelize.col('quantity'),
          Op.gt,
          sequelize.col('quantity_consumed')
        )
      ]
    },
    include: [
      {
        model: Item,
        as: 'item',
        where: buildStockBearingItemWhere(buildVisibleWhere({ status: 'active' })),
        attributes: ['item_id', 'name', 'sku_code', 'unit_of_measure', 'cost_per_unit', 'category', 'mode_item_preset']
      },
      {
        model: TenantLocation,
        as: 'location',
        required: false,
        attributes: ['location_id', 'name']
      }
    ],
    order: [['received_date', 'ASC']]
  });

  // Define aging thresholds
  const freshDays = 14;
  const agingDays = 30;

  const batchDetails = [];
  const itemSummary = {};

  batches.forEach(batch => {
    if (!batch.item) return;

    const receivedDate = new Date(batch.received_date);
    const daysInStock = Math.floor((today - receivedDate) / (1000 * 60 * 60 * 24));
    const availableQty = parseFloat(batch.quantity) - parseFloat(batch.quantity_consumed);
    const totalQty = parseFloat(batch.quantity);
    const consumedQty = parseFloat(batch.quantity_consumed);
    const costPerUnit = parseFloat(batch.cost_per_unit || batch.item.cost_per_unit) || 0;
    const valueAtRisk = availableQty * costPerUnit;

    // Calculate turnover rate (consumed / total)
    const turnoverRate = totalQty > 0 ? (consumedQty / totalQty) * 100 : 0;

    let agingStatus = 'fresh';
    if (daysInStock > agingDays) agingStatus = 'critical';
    else if (daysInStock > freshDays) agingStatus = 'aging';

    const batchData = {
      batch_id: batch.batch_id,
      item_id: batch.item_id,
      item_name: batch.item.name,
      sku_code: batch.item.sku_code,
      category: batch.item.category,
      received_date: batch.received_date,
      expiry_date: batch.expiry_date,
      days_in_stock: daysInStock,
      aging_status: agingStatus,
      original_quantity: totalQty,
      consumed_quantity: consumedQty,
      available_quantity: availableQty,
      unit_of_measure: batch.item.unit_of_measure,
      turnover_rate: turnoverRate,
      cost_per_unit: costPerUnit,
      value_at_risk: valueAtRisk,
      po_number: batch.po_number,
      location_id: batch.location_id || null,
      location_name: batch.location?.name || null
    };

    batchDetails.push(batchData);

    // Aggregate by item
    if (!itemSummary[batch.item_id]) {
      itemSummary[batch.item_id] = {
        item_id: batch.item_id,
        item_name: batch.item.name,
        sku_code: batch.item.sku_code,
        category: batch.item.category,
        total_batches: 0,
        total_available_qty: 0,
        total_value: 0,
        oldest_days: 0,
        avg_turnover_rate: 0,
        turnover_rates: []
      };
    }

    itemSummary[batch.item_id].total_batches++;
    itemSummary[batch.item_id].total_available_qty += availableQty;
    itemSummary[batch.item_id].total_value += valueAtRisk;
    itemSummary[batch.item_id].oldest_days = Math.max(itemSummary[batch.item_id].oldest_days, daysInStock);
    itemSummary[batch.item_id].turnover_rates.push(turnoverRate);
  });

  // Calculate average turnover for each item
  Object.values(itemSummary).forEach(item => {
    const rates = item.turnover_rates;
    item.avg_turnover_rate = rates.length > 0
      ? rates.reduce((a, b) => a + b, 0) / rates.length
      : 0;
    delete item.turnover_rates;
  });

  const itemSummaryArray = Object.values(itemSummary).sort((a, b) => b.oldest_days - a.oldest_days);

  return {
    summary: {
      total_batches: batchDetails.length,
      total_items: itemSummaryArray.length,
      fresh_batches: batchDetails.filter(b => b.aging_status === 'fresh').length,
      aging_batches: batchDetails.filter(b => b.aging_status === 'aging').length,
      critical_batches: batchDetails.filter(b => b.aging_status === 'critical').length,
      total_value_at_risk: batchDetails.reduce((sum, b) => sum + b.value_at_risk, 0),
      generated_at: new Date().toISOString()
    },
    batches: batchDetails,
    by_item: itemSummaryArray
  };
};

// ============================================
// PRODUCTION REPORT (P2 Priority)
// ============================================

/**
 * Get production/consumption report from Job Orders
 */
export const getProductionReport = async (filters = {}) => {
  const JobOrder = dbStore.get('JobOrder');
  const Item = dbStore.get('Item');
  const StockMovement = dbStore.get('StockMovement');

  // Build date filter
  const dateFilter = {};
  if (filters.startDate) {
    dateFilter[Op.gte] = filters.startDate;
  }
  if (filters.endDate) {
    dateFilter[Op.lte] = filters.endDate;
  }

  // Get Job Orders
  const jobOrders = await JobOrder.findAll({
    where: {
      ...(Object.keys(dateFilter).length > 0 && { created_date: dateFilter }),
      archived_at: null
    },
    include: [{
      model: Item,
      as: 'product',
      attributes: ['item_id', 'name', 'sku_code', 'category']
    }],
    order: [['created_date', 'DESC']]
  });

  // Calculate completion rates
  const statusCounts = {
    draft: 0,
    in_progress: 0,
    partial: 0,
    completed: 0,
    cancelled: 0
  };

  let totalToProduceQty = 0;
  let totalProducedQty = 0;

  const joDetails = jobOrders.map(jo => {
    statusCounts[jo.status] = (statusCounts[jo.status] || 0) + 1;

    const toProduceQty = parseFloat(jo.quantity_to_produce) || 0;
    const producedQty = parseFloat(jo.quantity_produced) || 0;

    totalToProduceQty += toProduceQty;
    totalProducedQty += producedQty;

    return {
      jo_id: jo.jo_id,
      jo_number: jo.jo_number,
      product_id: jo.product_id,
      product_name: jo.product?.name || 'Unknown',
      quantity_to_produce: toProduceQty,
      quantity_produced: producedQty,
      completion_percentage: toProduceQty > 0 ? (producedQty / toProduceQty) * 100 : 0,
      status: jo.status,
      created_date: jo.created_date,
      completion_date: jo.completion_date
    };
  });

  // Get consumption/loss data from stock movements
  const consumptionData = await StockMovement.findAll({
    where: {
      movement_type: { [Op.in]: ['production_consumption', 'calculated_loss'] },
      ...(Object.keys(dateFilter).length > 0 && { timestamp: dateFilter })
    },
    include: [{
      model: Item,
      as: 'item',
      attributes: ['item_id', 'name', 'sku_code', 'category', 'unit_of_measure']
    }]
  });

  // Aggregate consumption by item
  const consumptionByItem = {};
  const lossByReason = {
    waste: 0,
    spoilage: 0,
    damage: 0,
    pilferage: 0,
    other: 0
  };

  let totalConsumption = 0;
  let totalLosses = 0;

  consumptionData.forEach(mov => {
    const qty = parseFloat(mov.quantity) || 0;

    if (mov.movement_type === 'production_consumption') {
      totalConsumption += qty;

      const itemId = mov.item_id;
      if (!consumptionByItem[itemId]) {
        consumptionByItem[itemId] = {
          item_id: itemId,
          item_name: mov.item?.name || 'Unknown',
          sku_code: mov.item?.sku_code,
          category: mov.item?.category,
          unit_of_measure: mov.item?.unit_of_measure,
          total_consumed: 0,
          movement_count: 0
        };
      }
      consumptionByItem[itemId].total_consumed += qty;
      consumptionByItem[itemId].movement_count++;
    } else if (mov.movement_type === 'calculated_loss') {
      totalLosses += qty;
      const reason = mov.loss_reason || 'other';
      lossByReason[reason] = (lossByReason[reason] || 0) + qty;
    }
  });

  const topConsumedItems = Object.values(consumptionByItem)
    .sort((a, b) => b.total_consumed - a.total_consumed)
    .slice(0, 20);

  return {
    summary: {
      total_job_orders: jobOrders.length,
      status_breakdown: statusCounts,
      completion_rate: jobOrders.length > 0
        ? (statusCounts.completed / jobOrders.length) * 100
        : 0,
      total_quantity_to_produce: totalToProduceQty,
      total_quantity_produced: totalProducedQty,
      production_efficiency: totalToProduceQty > 0
        ? (totalProducedQty / totalToProduceQty) * 100
        : 0,
      total_consumption: totalConsumption,
      total_losses: totalLosses,
      waste_percentage: totalConsumption > 0
        ? (totalLosses / (totalConsumption + totalLosses)) * 100
        : 0,
      generated_at: new Date().toISOString()
    },
    job_orders: joDetails,
    top_consumed_items: topConsumedItems,
    loss_breakdown: lossByReason
  };
};

// ============================================
// PURCHASE ORDER ANALYSIS (P3 Priority)
// ============================================

/**
 * Get Purchase Order analysis with supplier performance
 */
export const getPurchaseOrderAnalysis = async (filters = {}) => {
  const PurchaseOrder = dbStore.get('PurchaseOrder');
  const Supplier = dbStore.get('Supplier');
  const POLineItem = dbStore.get('POLineItem');
  const Item = dbStore.get('Item');
  const valuationLocationId = Number.parseInt(filters.location_id, 10);
  const hasValuationLocation = Number.isInteger(valuationLocationId) && valuationLocationId > 0;

  // Build date filter
  const dateFilter = {};
  if (filters.startDate) {
    dateFilter[Op.gte] = filters.startDate;
  }
  if (filters.endDate) {
    dateFilter[Op.lte] = filters.endDate;
  }

  // Get Purchase Orders
  const purchaseOrders = await PurchaseOrder.findAll({
    where: {
      ...(Object.keys(dateFilter).length > 0 && { order_date: dateFilter }),
      archived_at: null
    },
    include: [
      {
        model: Supplier,
        as: 'supplier',
        attributes: ['supplier_id', 'name', 'quality_rating', 'avg_delivery_days']
      },
      {
        model: POLineItem,
        as: 'items',
        include: [{
          model: Item,
          as: 'item',
          attributes: ['item_id', 'name', 'sku_code', 'cost_per_unit', 'current_stock']
        }]
      }
    ],
    order: [['order_date', 'DESC']]
  });

  const valuationItems = purchaseOrders
    .flatMap((po) => po.items || [])
    .map((poItem) => {
      const itemRow = poItem?.item;
      if (!itemRow) return null;
      return typeof itemRow.toJSON === 'function' ? itemRow.toJSON() : itemRow;
    })
    .filter(Boolean);

  const itemCostMetrics = await getItemsCostMetrics({
    items: valuationItems,
    locationId: hasValuationLocation ? valuationLocationId : null
  });

  // Status breakdown
  const statusCounts = {
    draft: 0,
    pending: 0,
    partial: 0,
    received: 0,
    cancelled: 0
  };

  let totalOrderValue = 0;
  let totalReceivedValue = 0;
  let totalOrders = purchaseOrders.length;

  // Supplier performance tracking
  const supplierStats = {};

  // Item order frequency
  const itemFrequency = {};

  // Cost trends by month
  const costByMonth = {};
  const sampledLineVariance = [];
  let orderedSupplierValue = 0;
  let orderedWeightedBaselineValue = 0;
  let receivedSupplierValue = 0;
  let receivedWeightedBaselineValue = 0;

  purchaseOrders.forEach(po => {
    statusCounts[po.status] = (statusCounts[po.status] || 0) + 1;

    const orderValue = parseFloat(po.total_amount) || 0;
    totalOrderValue += orderValue;

    if (po.status === 'received') {
      totalReceivedValue += orderValue;
    }

    // Supplier stats
    if (po.supplier) {
      const supplierId = po.supplier.supplier_id;
      if (!supplierStats[supplierId]) {
        supplierStats[supplierId] = {
          supplier_id: supplierId,
          supplier_name: po.supplier.name,
          quality_rating: po.supplier.quality_rating,
          avg_delivery_days: po.supplier.avg_delivery_days,
          total_orders: 0,
          completed_orders: 0,
          total_value: 0,
          on_time_deliveries: 0,
          ordered_supplier_value: 0,
          ordered_weighted_baseline_value: 0,
          received_supplier_value: 0,
          received_weighted_baseline_value: 0,
          line_count: 0
        };
      }
      supplierStats[supplierId].total_orders++;
      supplierStats[supplierId].total_value += orderValue;
      if (po.status === 'received') {
        supplierStats[supplierId].completed_orders++;

        // Check on-time delivery
        if (po.expected_delivery_date && po.received_date) {
          const expected = new Date(po.expected_delivery_date);
          const actual = new Date(po.received_date);
          if (actual <= expected) {
            supplierStats[supplierId].on_time_deliveries++;
          }
        }
      }
    }

    // Item frequency
    (po.items || []).forEach(poItem => {
      if (poItem.item) {
        const itemId = poItem.item.item_id;
        const qtyOrdered = toNumberOrZero(poItem.quantity_ordered ?? poItem.quantity);
        const qtyReceived = toNumberOrZero(poItem.quantity_received);
        const unitPrice = toNumberOrZero(poItem.unit_price);
        const metrics = itemCostMetrics.get(Number(itemId));
        const baselineUnitCost = toNumberOrZero(
          metrics?.scoped?.weighted_avg_cost
          ?? metrics?.global?.weighted_avg_cost
          ?? poItem.item.cost_per_unit
        );
        const orderedActualValue = qtyOrdered * unitPrice;
        const orderedBaselineValue = qtyOrdered * baselineUnitCost;
        const receivedActualValue = qtyReceived * unitPrice;
        const receivedBaselineValue = qtyReceived * baselineUnitCost;
        const orderedVarianceValue = orderedActualValue - orderedBaselineValue;
        const receivedVarianceValue = receivedActualValue - receivedBaselineValue;

        if (!itemFrequency[itemId]) {
          itemFrequency[itemId] = {
            item_id: itemId,
            item_name: poItem.item.name,
            sku_code: poItem.item.sku_code,
            order_count: 0,
            total_quantity: 0,
            total_value: 0,
            total_received_quantity: 0,
            total_received_value: 0,
            weighted_baseline_value: 0,
            weighted_received_baseline_value: 0
          };
        }
        itemFrequency[itemId].order_count++;
        itemFrequency[itemId].total_quantity += qtyOrdered;
        itemFrequency[itemId].total_value += orderedActualValue;
        itemFrequency[itemId].total_received_quantity += qtyReceived;
        itemFrequency[itemId].total_received_value += receivedActualValue;
        itemFrequency[itemId].weighted_baseline_value += orderedBaselineValue;
        itemFrequency[itemId].weighted_received_baseline_value += receivedBaselineValue;

        orderedSupplierValue += orderedActualValue;
        orderedWeightedBaselineValue += orderedBaselineValue;
        receivedSupplierValue += receivedActualValue;
        receivedWeightedBaselineValue += receivedBaselineValue;

        if (po.supplier) {
          const supplierId = po.supplier.supplier_id;
          const supplierEntry = supplierStats[supplierId];
          if (supplierEntry) {
            supplierEntry.ordered_supplier_value += orderedActualValue;
            supplierEntry.ordered_weighted_baseline_value += orderedBaselineValue;
            supplierEntry.received_supplier_value += receivedActualValue;
            supplierEntry.received_weighted_baseline_value += receivedBaselineValue;
            supplierEntry.line_count += 1;
          }
        }

        sampledLineVariance.push({
          po_id: po.po_id,
          po_number: po.po_number,
          supplier_id: po.supplier?.supplier_id || null,
          supplier_name: po.supplier?.name || null,
          item_id: itemId,
          item_name: poItem.item.name,
          unit_price: round4(unitPrice),
          weighted_avg_cost: round4(baselineUnitCost),
          qty_ordered: round4(qtyOrdered),
          qty_received: round4(qtyReceived),
          ordered_variance_value: round4(orderedVarianceValue),
          ordered_variance_percent: baselineUnitCost > 0
            ? round4(((unitPrice - baselineUnitCost) / baselineUnitCost) * 100)
            : null,
          received_variance_value: round4(receivedVarianceValue),
          source: resolveVarianceBaselineSource(metrics)
        });
      }
    });

    // Cost by month
    const orderMonth = new Date(po.order_date).toISOString().substring(0, 7); // YYYY-MM
    if (!costByMonth[orderMonth]) {
      costByMonth[orderMonth] = { month: orderMonth, order_count: 0, total_value: 0 };
    }
    costByMonth[orderMonth].order_count++;
    costByMonth[orderMonth].total_value += orderValue;
  });

  // Calculate supplier on-time rates
  Object.values(supplierStats).forEach(supplier => {
    supplier.on_time_rate = supplier.completed_orders > 0
      ? (supplier.on_time_deliveries / supplier.completed_orders) * 100
      : 0;
    supplier.ordered_vs_weighted_variance_value = round4(
      supplier.ordered_supplier_value - supplier.ordered_weighted_baseline_value
    );
    supplier.ordered_vs_weighted_variance_percent = supplier.ordered_weighted_baseline_value > 0
      ? round4(toVariancePercent(supplier.ordered_supplier_value, supplier.ordered_weighted_baseline_value))
      : null;
    supplier.received_vs_weighted_variance_value = round4(
      supplier.received_supplier_value - supplier.received_weighted_baseline_value
    );
    supplier.received_vs_weighted_variance_percent = supplier.received_weighted_baseline_value > 0
      ? round4(toVariancePercent(supplier.received_supplier_value, supplier.received_weighted_baseline_value))
      : null;
  });

  const itemVarianceSummary = Object.values(itemFrequency).map((item) => {
    const orderedVarianceValue = item.total_value - item.weighted_baseline_value;
    const receivedVarianceValue = item.total_received_value - item.weighted_received_baseline_value;
    return {
      ...item,
      ordered_vs_weighted_variance_value: round4(orderedVarianceValue),
      ordered_vs_weighted_variance_percent: item.weighted_baseline_value > 0
        ? round4(toVariancePercent(item.total_value, item.weighted_baseline_value))
        : null,
      received_vs_weighted_variance_value: round4(receivedVarianceValue),
      received_vs_weighted_variance_percent: item.weighted_received_baseline_value > 0
        ? round4(toVariancePercent(item.total_received_value, item.weighted_received_baseline_value))
        : null
    };
  });

  const orderedVarianceTotal = orderedSupplierValue - orderedWeightedBaselineValue;
  const receivedVarianceTotal = receivedSupplierValue - receivedWeightedBaselineValue;

  // Get pending POs (expected deliveries)
  const pendingPOs = purchaseOrders
    .filter(po => ['pending', 'partial'].includes(po.status))
    .map(po => ({
      po_id: po.po_id,
      po_number: po.po_number,
      supplier_name: po.supplier?.name || 'Unknown',
      order_date: po.order_date,
      expected_delivery_date: po.expected_delivery_date,
      status: po.status,
      total_amount: parseFloat(po.total_amount) || 0
    }));

  return {
    summary: {
      total_orders: totalOrders,
      status_breakdown: statusCounts,
      total_order_value: totalOrderValue,
      total_received_value: totalReceivedValue,
      pending_orders: statusCounts.pending + statusCounts.partial,
      fulfillment_rate: totalOrders > 0
        ? (statusCounts.received / totalOrders) * 100
        : 0,
      generated_at: new Date().toISOString()
    },
    pending_deliveries: pendingPOs,
    supplier_performance: Object.values(supplierStats).sort((a, b) => b.total_value - a.total_value),
    most_ordered_items: [...itemVarianceSummary].sort((a, b) => b.order_count - a.order_count).slice(0, 20),
    cost_trends: Object.values(costByMonth).sort((a, b) => a.month.localeCompare(b.month)),
    cost_variance: {
      baseline_scope: hasValuationLocation ? 'location' : 'global',
      baseline_location_id: hasValuationLocation ? valuationLocationId : null,
      summary: {
        ordered_supplier_value: round4(orderedSupplierValue),
        ordered_weighted_baseline_value: round4(orderedWeightedBaselineValue),
        ordered_vs_weighted_variance_value: round4(orderedVarianceTotal),
        ordered_vs_weighted_variance_percent: orderedWeightedBaselineValue > 0
          ? round4(toVariancePercent(orderedSupplierValue, orderedWeightedBaselineValue))
          : null,
        received_supplier_value: round4(receivedSupplierValue),
        received_weighted_baseline_value: round4(receivedWeightedBaselineValue),
        received_vs_weighted_variance_value: round4(receivedVarianceTotal),
        received_vs_weighted_variance_percent: receivedWeightedBaselineValue > 0
          ? round4(toVariancePercent(receivedSupplierValue, receivedWeightedBaselineValue))
          : null,
        analyzed_line_count: sampledLineVariance.length
      },
      by_supplier: Object.values(supplierStats)
        .sort((a, b) => Math.abs(b.ordered_vs_weighted_variance_value) - Math.abs(a.ordered_vs_weighted_variance_value)),
      by_item: [...itemVarianceSummary]
        .sort((a, b) => Math.abs(b.ordered_vs_weighted_variance_value) - Math.abs(a.ordered_vs_weighted_variance_value))
        .slice(0, 25),
      line_samples: sampledLineVariance
        .sort((a, b) => Math.abs(b.ordered_variance_value) - Math.abs(a.ordered_variance_value))
        .slice(0, 50)
    }
  };
};

// ============================================
// EXECUTIVE SUMMARY (P4 Priority)
// ============================================

/**
 * Get executive summary with key metrics
 */
export const getExecutiveSummary = async (filters = {}) => {
  const Item = dbStore.get('Item');
  const StockMovement = dbStore.get('StockMovement');
  const sequelize = dbStore.getStore()?.sequelize || dbStore.get('sequelize');

  // Get all component reports
  const [expiryData, agingData, financialData, productionData, poData] = await Promise.all([
    getExpiryReport(filters),
    getEnhancedStockAgingReport(filters),
    getFinancialSummary(),
    getProductionReport(filters),
    getPurchaseOrderAnalysis(filters)
  ]);

  // Get low stock items count
  const lowStockItems = await Item.findAll({
    where: buildStockBearingItemWhere(buildVisibleWhere({
      status: 'active',
      min_threshold: { [Op.ne]: null },
      [Op.and]: [
        sequelize.where(
          sequelize.col('current_stock'),
          Op.lte,
          sequelize.col('min_threshold')
        )
      ]
    })),
    attributes: ['item_id', 'name', 'sku_code', 'current_stock', 'min_threshold']
  });

  // Get top movers from stock movements
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const recentMovements = await StockMovement.findAll({
    where: {
      timestamp: { [Op.gte]: thirtyDaysAgo },
      movement_type: { [Op.in]: ['production_consumption', 'purchase_receipt'] }
    },
    include: [{
      model: Item,
      as: 'item',
      attributes: ['item_id', 'name', 'sku_code', 'category']
    }]
  });

  // Aggregate movement by item
  const itemMovement = {};
  recentMovements.forEach(mov => {
    if (!mov.item) return;
    const itemId = mov.item_id;
    if (!itemMovement[itemId]) {
      itemMovement[itemId] = {
        item_id: itemId,
        item_name: mov.item.name,
        sku_code: mov.item.sku_code,
        category: mov.item.category,
        total_movement: 0,
        movement_count: 0
      };
    }
    itemMovement[itemId].total_movement += parseFloat(mov.quantity) || 0;
    itemMovement[itemId].movement_count++;
  });

  const sortedByMovement = Object.values(itemMovement)
    .sort((a, b) => b.total_movement - a.total_movement);

  return {
    generated_at: new Date().toISOString(),
    date_range: {
      start: filters.startDate || null,
      end: filters.endDate || null
    },
    inventory_overview: {
      total_inventory_value: financialData.total_inventory_value,
      weighted_total_inventory_value: financialData.weighted_total_inventory_value ?? financialData.total_inventory_value,
      weighted_total_available_qty: financialData.weighted_total_available_qty ?? 0,
      weighted_average_cost_per_unit: financialData.weighted_average_cost_per_unit ?? 0,
      legacy_total_inventory_value: financialData.legacy_total_inventory_value ?? financialData.total_inventory_value,
      total_items: financialData.total_items,
      items_with_value: financialData.items_with_value,
      average_item_value: financialData.average_item_value
    },
    stock_health: {
      low_stock_count: lowStockItems.length,
      low_stock_items: lowStockItems.slice(0, 10).map(i => ({
        item_id: i.item_id,
        name: i.name,
        sku_code: i.sku_code,
        current_stock: parseFloat(i.current_stock),
        min_threshold: parseFloat(i.min_threshold)
      }))
    },
    expiry_risk: {
      expired_count: expiryData.summary.total_expired_batches,
      expired_value: expiryData.summary.total_expired_value,
      critical_count: expiryData.summary.total_critical_batches,
      critical_value: expiryData.summary.total_critical_value,
      total_value_at_risk: expiryData.summary.total_value_at_risk
    },
    aging_overview: {
      total_batches: agingData.summary.total_batches,
      fresh_batches: agingData.summary.fresh_batches,
      aging_batches: agingData.summary.aging_batches,
      critical_batches: agingData.summary.critical_batches
    },
    production_overview: {
      total_job_orders: productionData.summary.total_job_orders,
      completion_rate: productionData.summary.completion_rate,
      production_efficiency: productionData.summary.production_efficiency,
      waste_percentage: productionData.summary.waste_percentage
    },
    procurement_overview: {
      total_orders: poData.summary.total_orders,
      pending_orders: poData.summary.pending_orders,
      total_order_value: poData.summary.total_order_value,
      fulfillment_rate: poData.summary.fulfillment_rate,
      ordered_vs_weighted_variance_value: poData.cost_variance?.summary?.ordered_vs_weighted_variance_value ?? 0,
      ordered_vs_weighted_variance_percent: poData.cost_variance?.summary?.ordered_vs_weighted_variance_percent ?? null
    },
    top_movers: {
      fastest: sortedByMovement.slice(0, 10),
      slowest: sortedByMovement.slice(-10).reverse()
    }
  };
};

// ============================================
// COMPLIANCE BOOKS PACKAGE (BIR Submission Surface)
// ============================================

const toDayStart = (value) => {
  const parsed = value ? new Date(value) : new Date();
  if (Number.isNaN(parsed.getTime())) return null;
  parsed.setHours(0, 0, 0, 0);
  return parsed;
};

const toDayEnd = (value) => {
  const parsed = value ? new Date(value) : new Date();
  if (Number.isNaN(parsed.getTime())) return null;
  parsed.setHours(23, 59, 59, 999);
  return parsed;
};

const toNumeric = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const parseTransactionMeta = (rawValue) => {
  if (!rawValue) return {};
  if (rawValue && typeof rawValue === 'object' && !Array.isArray(rawValue)) return rawValue;
  if (typeof rawValue !== 'string') return {};

  try {
    const parsed = JSON.parse(rawValue);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed;
    }
  } catch {
    return {
      note: rawValue
    };
  }

  return {};
};

const inferSpecialDiscountCategory = (label) => {
  const normalized = String(label || '').trim().toLowerCase();
  if (!normalized) return null;
  if (normalized.includes('national') && normalized.includes('athlete')) return 'national_athlete';
  if (normalized.includes('senior')) return 'senior';
  if (normalized.includes('pwd')) return 'pwd';
  return null;
};

const stableStringify = (value) => {
  if (Array.isArray(value)) {
    return `[${value.map((entry) => stableStringify(entry)).join(',')}]`;
  }
  if (value && typeof value === 'object') {
    const keys = Object.keys(value).sort();
    return `{${keys.map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
};

const buildHash = (value) => crypto.createHash('sha256').update(stableStringify(value)).digest('hex');

const resolveExistingPath = (candidates = []) => (
  candidates.filter(Boolean).find((candidate) => fs.existsSync(candidate)) || candidates.filter(Boolean)[0] || null
);

const buildFileChecksum = (absolutePath) => {
  try {
    if (!absolutePath || !fs.existsSync(absolutePath)) return null;
    const payload = fs.readFileSync(absolutePath);
    return crypto.createHash('sha256').update(payload).digest('hex');
  } catch {
    return null;
  }
};

const buildDocumentaryArtifactChecksums = () => {
  const configuredSubmissionRoot = String(process.env.COMPLIANCE_SUBMISSION_DOCS_ROOT || '').trim();
  const configuredEvidenceRoot = String(process.env.COMPLIANCE_EVIDENCE_DOCS_ROOT || '').trim();

  const submissionRoot = resolveExistingPath([
    configuredSubmissionRoot || null,
    path.resolve(process.cwd(), 'docs', 'compliance', 'submission'),
    path.resolve(process.cwd(), '..', 'docs', 'compliance', 'submission')
  ]) || path.resolve(process.cwd(), 'docs', 'compliance', 'submission');
  const evidenceRoot = resolveExistingPath([
    configuredEvidenceRoot || null,
    path.resolve(process.cwd(), 'docs', 'compliance', 'evidence', 'drills'),
    path.resolve(process.cwd(), '..', 'docs', 'compliance', 'evidence', 'drills')
  ]) || path.resolve(process.cwd(), 'docs', 'compliance', 'evidence', 'drills');

  return {
    system_flow_diagram_sha256: buildFileChecksum(path.resolve(submissionRoot, 'system-flow-diagram.mmd')),
    system_flow_diagram_image_sha256: buildFileChecksum(path.resolve(submissionRoot, 'system-flow-diagram.png')),
    software_specification_sha256: buildFileChecksum(path.resolve(submissionRoot, 'software-specification-dgfy.md')),
    backup_disaster_recovery_plan_sha256: buildFileChecksum(path.resolve(submissionRoot, 'backup-disaster-recovery-plan.md')),
    filing_instructions_sha256: buildFileChecksum(path.resolve(submissionRoot, 'filing-instructions.md')),
    restore_drill_evidence_sha256: buildFileChecksum(path.resolve(evidenceRoot, 'latest-restore-drill.json')),
    encryption_verification_evidence_sha256: buildFileChecksum(path.resolve(evidenceRoot, 'latest-encryption-verification.json'))
  };
};

const buildSubmissionManifest = (payload, filingProfile = 'dgfy') => ({
  version: 'submission-manifest.v1',
  filing_profile: filingProfile,
  generated_at: new Date().toISOString(),
  instructions_ref: 'docs/compliance/submission/filing-instructions.md',
  checksums: {
    sales_journal_sha256: buildHash(payload?.sales_journal?.rows || []),
    purchase_journal_sha256: buildHash(payload?.purchase_journal?.rows || []),
    inventory_book_sha256: buildHash(payload?.inventory_book?.rows || []),
    special_discount_journal_sha256: buildHash(payload?.special_discount_journal?.rows || []),
    package_sha256: buildHash(payload || {}),
    ...buildDocumentaryArtifactChecksums()
  }
});

const escapeCsvCell = (value) => {
  if (value === null || value === undefined) return '';
  const text = String(value);
  if (text.includes(',') || text.includes('"') || text.includes('\n')) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
};

const toCsv = (columns = [], rows = []) => {
  const header = columns.map((column) => escapeCsvCell(column)).join(',');
  const lines = [header];
  rows.forEach((entry) => {
    const row = columns.map((column) => escapeCsvCell(entry?.[column]));
    lines.push(row.join(','));
  });
  return `${lines.join('\n')}\n`;
};

export const getComplianceBooksPackage = async (filters = {}) => {
  const PosTransaction = dbStore.get('PosTransaction');
  const PurchaseOrder = dbStore.get('PurchaseOrder');
  const StockMovement = dbStore.get('StockMovement');
  const Item = dbStore.get('Item');

  const rangeStart = toDayStart(filters.startDate) || (() => {
    const fallback = new Date();
    fallback.setDate(fallback.getDate() - 30);
    fallback.setHours(0, 0, 0, 0);
    return fallback;
  })();
  const rangeEnd = toDayEnd(filters.endDate) || toDayEnd(new Date());

  const [salesRows, purchaseRows, movementRows] = await Promise.all([
    PosTransaction.findAll({
      where: {
        status: 'completed',
        created_at: {
          [Op.between]: [rangeStart, rangeEnd]
        }
      },
      order: [['created_at', 'ASC']]
    }),
    PurchaseOrder.findAll({
      where: {
        archived_at: null,
        order_date: {
          [Op.between]: [rangeStart.toISOString().slice(0, 10), rangeEnd.toISOString().slice(0, 10)]
        }
      },
      order: [['order_date', 'ASC']]
    }),
    StockMovement.findAll({
      where: {
        timestamp: {
          [Op.between]: [rangeStart, rangeEnd]
        }
      },
      include: [{
        model: Item,
        as: 'item',
        attributes: ['item_id', 'name', 'sku_code', 'unit_of_measure']
      }],
      order: [['timestamp', 'ASC']]
    })
  ]);

  const salesJournalRows = salesRows.map((entry) => ({
    transaction_datetime: entry.created_at,
    invoice_number: entry.invoice_number,
    document_type: entry.document_type,
    document_context: entry.document_context,
    terminal_id: entry.terminal_id,
    payment_type: entry.payment_type,
    subtotal_amount: toNumeric(entry.subtotal_amount),
    discount_amount: toNumeric(entry.discount_amount),
    service_fee_amount: toNumeric(entry.service_fee_amount),
    vat_amount: toNumeric(entry.vat_amount),
    total_amount: toNumeric(entry.total_amount)
  }));

  const purchaseJournalRows = purchaseRows.map((entry) => ({
    order_date: entry.order_date,
    po_number: entry.po_number,
    supplier_id: entry.supplier_id,
    status: entry.status,
    received_date: entry.received_date,
    subtotal: toNumeric(entry.subtotal),
    discount: toNumeric(entry.discount),
    total_amount: toNumeric(entry.total_amount)
  }));

  const inventoryBookRows = movementRows.map((entry) => {
    const quantity = toNumeric(entry.quantity);
    const isInbound = ['purchase_receipt', 'return', 'production_output', 'adjustment', 'transfer'].includes(entry.movement_type);
    const quantityIn = isInbound ? quantity : 0;
    const quantityOut = isInbound ? 0 : quantity;

    return {
      movement_datetime: entry.timestamp,
      movement_type: entry.movement_type,
      reference_type: entry.reference_type,
      reference_id: entry.reference_id,
      item_id: entry.item_id,
      sku_code: entry.item?.sku_code || null,
      item_name: entry.item?.name || null,
      unit_of_measure: entry.item?.unit_of_measure || null,
      quantity_in: quantityIn,
      quantity_out: quantityOut,
      notes: entry.notes || null
    };
  });

  const specialDiscountRows = salesRows.flatMap((entry) => {
    const discountAmount = toNumeric(entry.discount_amount);
    if (discountAmount <= 0) return [];

    const transactionMeta = parseTransactionMeta(entry.special_instructions);
    const beneficiary = transactionMeta?.discount_beneficiary
      && typeof transactionMeta.discount_beneficiary === 'object'
      ? transactionMeta.discount_beneficiary
      : null;
    const beneficiaries = Array.isArray(transactionMeta?.discount_beneficiaries)
      ? transactionMeta.discount_beneficiaries
      : [];
    if (beneficiaries.length > 0) {
      return beneficiaries.map((item) => ({
        transaction_datetime: entry.created_at,
        invoice_number: entry.invoice_number,
        discount_label: entry.discount_label_snapshot || null,
        discount_amount: toNumeric(item.discount_amount),
        beneficiary_category: String(item.category || '').trim().toLowerCase() || null,
        beneficiary_name: String(item.name || '').trim() || null,
        beneficiary_id_number: String(item.id_number || '').trim() || null
      }));
    }
    const category = String(
      beneficiary?.category
      || inferSpecialDiscountCategory(entry.discount_label_snapshot)
      || ''
    ).trim().toLowerCase() || null;

    if (!['senior', 'pwd', 'national_athlete'].includes(category)) {
      return [];
    }

    return [{
      transaction_datetime: entry.created_at,
      invoice_number: entry.invoice_number,
      discount_label: entry.discount_label_snapshot || null,
      discount_amount: discountAmount,
      beneficiary_category: category,
      beneficiary_name: String(beneficiary?.name || entry.customer_name || '').trim() || null,
      beneficiary_id_number: String(beneficiary?.id_number || entry.customer_phone || '').trim() || null
    }];
  }).filter(Boolean);

  const compliancePackage = {
    schema_version: 'compliance-books.v1',
    generated_at: new Date().toISOString(),
    date_range: {
      start: rangeStart.toISOString(),
      end: rangeEnd.toISOString()
    },
    sales_journal: {
      columns: [
        'transaction_datetime',
        'invoice_number',
        'document_type',
        'document_context',
        'terminal_id',
        'payment_type',
        'subtotal_amount',
        'discount_amount',
        'service_fee_amount',
        'vat_amount',
        'total_amount'
      ],
      rows: salesJournalRows
    },
    purchase_journal: {
      columns: [
        'order_date',
        'po_number',
        'supplier_id',
        'status',
        'received_date',
        'subtotal',
        'discount',
        'total_amount'
      ],
      rows: purchaseJournalRows
    },
    inventory_book: {
      columns: [
        'movement_datetime',
        'movement_type',
        'reference_type',
        'reference_id',
        'item_id',
        'sku_code',
        'item_name',
        'unit_of_measure',
        'quantity_in',
        'quantity_out',
        'notes'
      ],
      rows: inventoryBookRows
    },
    special_discount_journal: {
      columns: [
        'transaction_datetime',
        'invoice_number',
        'discount_label',
        'discount_amount',
        'beneficiary_category',
        'beneficiary_name',
        'beneficiary_id_number'
      ],
      rows: specialDiscountRows
    },
    record_counts: {
      sales_journal: salesJournalRows.length,
      purchase_journal: purchaseJournalRows.length,
      inventory_book: inventoryBookRows.length,
      special_discount_journal: specialDiscountRows.length
    }
  };

  return {
    ...compliancePackage,
    submission_manifest: buildSubmissionManifest(compliancePackage)
  };
};

export const exportComplianceBooksPackage = async (filters = {}, options = {}) => {
  const filingProfile = String(options?.filing_profile || 'dgfy').trim().toLowerCase() || 'dgfy';
  const data = await getComplianceBooksPackage(filters);
  const generatedAtToken = String(data?.generated_at || new Date().toISOString()).replace(/[:.]/g, '-');

  const files = [
    {
      name: 'sales_journal.csv',
      mime_type: 'text/csv',
      content: toCsv(data?.sales_journal?.columns || [], data?.sales_journal?.rows || [])
    },
    {
      name: 'purchase_journal.csv',
      mime_type: 'text/csv',
      content: toCsv(data?.purchase_journal?.columns || [], data?.purchase_journal?.rows || [])
    },
    {
      name: 'inventory_book.csv',
      mime_type: 'text/csv',
      content: toCsv(data?.inventory_book?.columns || [], data?.inventory_book?.rows || [])
    },
    {
      name: 'special_discount_journal.csv',
      mime_type: 'text/csv',
      content: toCsv(data?.special_discount_journal?.columns || [], data?.special_discount_journal?.rows || [])
    }
  ];

  return {
    bundle_name: `compliance-submission-${filingProfile}-${generatedAtToken}.json`,
    generated_at: new Date().toISOString(),
    filing_profile: filingProfile,
    submission_manifest: {
      ...(data?.submission_manifest || {}),
      filing_profile: filingProfile
    },
    record_counts: data?.record_counts || {},
    files
  };
};

// ============================================
// LEGACY REPORTS (Keep existing)
// ============================================

export const getStockAgingReport = async () => {
  const Item = dbStore.get('Item');
  const FIFOBatch = dbStore.get('FIFOBatch');

  const items = await Item.findAll({
    where: buildStockBearingItemWhere(buildVisibleWhere({ status: 'active' })),
    include: [
      {
        model: FIFOBatch,
        as: 'fifoBatches',
        required: false
      }
    ]
  });

  const agingData = items.map(item => {
    const batches = item.fifoBatches || [];
    const oldestBatch = batches.length > 0
      ? batches.reduce((oldest, batch) =>
        new Date(batch.received_date) < new Date(oldest.received_date) ? batch : oldest
      )
      : null;

    const daysInStock = oldestBatch
      ? Math.floor((new Date() - new Date(oldestBatch.received_date)) / (1000 * 60 * 60 * 24))
      : 0;

    return {
      item_id: item.item_id,
      sku_code: item.sku_code,
      name: item.name,
      current_stock: item.current_stock,
      days_in_stock: daysInStock,
      oldest_batch_date: oldestBatch?.received_date
    };
  });

  return agingData.sort((a, b) => b.days_in_stock - a.days_in_stock);
};

export const getSurplusShortageReport = async () => {
  const Item = dbStore.get('Item');

  const items = await Item.findAll({
    where: buildStockBearingItemWhere(buildVisibleWhere({ status: 'active' }))
  });

  const report = items.map(item => {
    const currentStock = parseFloat(item.current_stock) || 0;
    const maxCapacity = parseFloat(item.max_capacity) || 0;
    const minThreshold = parseFloat(item.min_threshold) || 0;

    const stockPercentage = maxCapacity > 0 ? (currentStock / maxCapacity) * 100 : 0;
    const isLowStock = currentStock <= minThreshold;
    const isSurplus = stockPercentage > 80;

    return {
      item_id: item.item_id,
      sku_code: item.sku_code,
      name: item.name,
      current_stock: currentStock,
      max_capacity: maxCapacity,
      min_threshold: minThreshold,
      stock_percentage: stockPercentage,
      status: isLowStock ? 'shortage' : isSurplus ? 'surplus' : 'normal'
    };
  });

  return report;
};

export const getFinancialSummary = async () => {
  const Item = dbStore.get('Item');

  const [items, weightedOverview] = await Promise.all([
    Item.findAll({
      where: buildStockBearingItemWhere(buildVisibleWhere({ status: 'active' })),
      attributes: ['current_stock', 'cost_per_unit', 'category', 'mode_item_preset']
    }),
    getWeightedInventoryValueOverview()
  ]);

  const totalValue = items.reduce((sum, item) => {
    const stock = parseFloat(item.current_stock) || 0;
    const cost = parseFloat(item.cost_per_unit) || 0;
    return sum + (stock * cost);
  }, 0);

  const totalItems = items.length;
  const itemsWithValue = items.filter(item =>
    parseFloat(item.cost_per_unit) > 0 && parseFloat(item.current_stock) > 0
  ).length;

  return {
    total_inventory_value: totalValue,
    legacy_total_inventory_value: totalValue,
    weighted_total_inventory_value: weightedOverview.weighted_total_inventory_value,
    weighted_total_available_qty: weightedOverview.weighted_total_available_qty,
    weighted_average_cost_per_unit: weightedOverview.weighted_average_cost_per_unit,
    total_items: totalItems,
    items_with_value: itemsWithValue,
    average_item_value: itemsWithValue > 0 ? totalValue / itemsWithValue : 0,
    inventory_value_delta: round4(weightedOverview.weighted_total_inventory_value - totalValue)
  };
};

export const getSupplierPerformanceReport = async () => {
  const Supplier = dbStore.get('Supplier');
  const PurchaseOrder = dbStore.get('PurchaseOrder');

  const suppliers = await Supplier.findAll({
    include: [
      {
        model: PurchaseOrder,
        as: 'purchaseOrders',
        required: false
      }
    ]
  });

  return suppliers.map(supplier => {
    const pos = supplier.purchaseOrders || [];
    const completedPOs = pos.filter(po => po.status === 'received');
    const avgDeliveryDays = supplier.avg_delivery_days || 0;
    const qualityRating = supplier.quality_rating || 0;

    return {
      supplier_id: supplier.supplier_id,
      name: supplier.name,
      total_orders: pos.length,
      completed_orders: completedPOs.length,
      avg_delivery_days: avgDeliveryDays,
      quality_rating: qualityRating,
      performance_score: (qualityRating * 20) + (completedPOs.length > 0 ? 50 : 0) + (avgDeliveryDays < 5 ? 30 : 0)
    };
  }).sort((a, b) => b.performance_score - a.performance_score);
};

// ============================================
// SNAPSHOT MANAGEMENT
// ============================================

/**
 * Save a report snapshot for historical viewing
 */
export const saveReportSnapshot = async (reportType, snapshotData, dateRange = {}, userId = null, reportName = null) => {
  const ReportSnapshot = dbStore.get('ReportSnapshot');
  const summaryMetrics = snapshotData.summary || {};

  const snapshot = await ReportSnapshot.create({
    report_type: reportType,
    report_name: reportName,
    snapshot_data: snapshotData,
    summary_metrics: summaryMetrics,
    date_range_start: dateRange.startDate || null,
    date_range_end: dateRange.endDate || null,
    created_by: userId
  });

  return snapshot;
};

/**
 * Get historical snapshots for a report type
 */
export const getReportSnapshots = async (reportType, limit = 20) => {
  const ReportSnapshot = dbStore.get('ReportSnapshot');
  const snapshots = await ReportSnapshot.findAll({
    where: { report_type: reportType },
    attributes: ['snapshot_id', 'report_name', 'summary_metrics', 'date_range_start', 'date_range_end', 'created_at'],
    order: [['created_at', 'DESC']],
    limit
  });

  return snapshots;
};

/**
 * Get a specific snapshot by ID
 */
export const getReportSnapshotById = async (snapshotId) => {
  const ReportSnapshot = dbStore.get('ReportSnapshot');
  const snapshot = await ReportSnapshot.findByPk(snapshotId);
  return snapshot;
};
