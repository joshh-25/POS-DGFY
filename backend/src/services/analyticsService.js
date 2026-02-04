import { Op } from 'sequelize';
import dbStore from '../utils/dbStore.js';

/**
 * Analytics Service
 * Provides statistical analysis for inventory optimization.
 * ALL calculations here are read-only and advisory.
 */

// Default values if data is missing
const DEFAULT_LEAD_TIME_DAYS = 7;
const DEFAULT_SAFETY_STOCK_BUFFER = 0.5; // 50% extra buffer
const ANALYSIS_PERIOD_DAYS = 30; // Look back 30 days for burn rate

/**
 * Calculate the "Burn Rate" (Daily Consumption Rate) for an item.
 * @param {number} itemId 
 * @param {number} days - Number of days to look back
 * @returns {Promise<Object>} { burnRate, totalConsumed, daysAnalyzed }
 */
export const calculateBurnRate = async (itemId, days = ANALYSIS_PERIOD_DAYS) => {
    const StockMovement = dbStore.get('StockMovement');
    const sequelize = dbStore.getStore()?.sequelize || dbStore.get('sequelize');

    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    // Sum all OUTGOING movements (negative quantity)
    // Types: production_consumption, calculated_loss, production_output (if negative adjustment?) 
    // accurate types: 'production_consumption', 'calculated_loss', 'adjustment' (if negative)
    // simplified: just sum all negative quantities

    const movements = await StockMovement.findAll({
        where: {
            item_id: itemId,
            timestamp: { [Op.gte]: startDate },
            quantity: { [Op.lt]: 0 } // Only consumption
        },
        attributes: [
            [sequelize.fn('SUM', sequelize.col('quantity')), 'total_consumed']
        ],
        raw: true
    });

    const totalConsumed = Math.abs(parseFloat(movements[0].total_consumed || 0));
    const burnRate = totalConsumed / days; // Avg units per day

    return {
        burnRate: parseFloat(burnRate.toFixed(4)),
        totalConsumed,
        daysAnalyzed: days
    };
};

/**
 * Calculate Reorder Point (ROP) recommendation.
 * Formula: (Daily Usage * Lead Time) + Safety Stock
 * @param {number} itemId 
 */
export const calculateReorderPoint = async (itemId) => {
    const Item = dbStore.get('Item');
    const SupplierItem = dbStore.get('SupplierItem');
    const Supplier = dbStore.get('Supplier');

    // 1. Get Item context (Current Stock, Assigned Suppliers)
    const item = await Item.findByPk(itemId, {
        include: [{
            model: SupplierItem,
            as: 'supplierItems',
            include: [{
                model: Supplier,
                as: 'supplier',
                attributes: ['avg_delivery_days', 'name']
            }]
        }]
    });

    if (!item) throw new Error('Item not found');

    // 2. Calculate Burn Rate
    const { burnRate } = await calculateBurnRate(itemId);

    // 3. Determine Lead Time
    // If multiple suppliers, take the weighted average or max? Let's take the average of active suppliers.
    let leadTime = DEFAULT_LEAD_TIME_DAYS;
    const suppliers = item.supplierItems?.map(si => si.supplier).filter(s => s) || [];

    if (suppliers.length > 0) {
        const validLeadTimes = suppliers
            .map(s => s.avg_delivery_days)
            .filter(d => d && d > 0);

        if (validLeadTimes.length > 0) {
            const sum = validLeadTimes.reduce((acc, val) => acc + val, 0);
            leadTime = sum / validLeadTimes.length;
        }
    }

    // 4. Calculate ROP
    // Lead Time Demand = Burn Rate * Lead Time
    const leadTimeDemand = burnRate * leadTime;

    // Safety Stock = (Burn Rate * Lead Time) * Buffer (e.g., 50% for unexpected spikes)
    // This is a simplified formula. Standard deviations would be better if we had variance data.
    const safetyStock = leadTimeDemand * DEFAULT_SAFETY_STOCK_BUFFER;

    const recommendedROP = Math.ceil(leadTimeDemand + safetyStock);
    const daysRemaining = burnRate > 0 ? (item.current_stock / burnRate) : 999;

    return {
        item_id: item.item_id,
        sku_code: item.sku_code,
        name: item.name,
        current_stock: parseFloat(item.current_stock),
        stats: {
            daily_burn_rate: burnRate,
            avg_lead_time_days: Math.round(leadTime),
            days_of_stock_remaining: parseFloat(daysRemaining.toFixed(1))
        },
        recommendation: {
            reorder_point: recommendedROP,
            safety_stock: Math.ceil(safetyStock),
            status: item.current_stock <= recommendedROP ? 'REORDER_NOW' : 'HEALTHY',
            reason: item.current_stock <= recommendedROP
                ? `Stock (${item.current_stock}) is below recommended ROP (${recommendedROP})`
                : `Stock covers expected demand for ${Math.round(daysRemaining)} days`
        }
    };
};

/**
 * Bulk analysis for all active items
 */
export const getReorderRecommendations = async (category = null) => {
    const Item = dbStore.get('Item');

    const where = { status: 'active' };
    if (category) where.category = category;

    const items = await Item.findAll({
        where,
        attributes: ['item_id']
    });

    const recommendations = [];

    // Process in parallel (limit concurrency in production, but ok for small sets)
    for (const i of items) {
        const rec = await calculateReorderPoint(i.item_id);
        if (rec.recommendation.status === 'REORDER_NOW') {
            recommendations.push(rec);
        }
    }

    // Sort by urgency (least days remaining)
    return recommendations.sort((a, b) =>
        a.stats.days_of_stock_remaining - b.stats.days_of_stock_remaining
    );
};

/**
 * Detect Anomalies in Stock Movements
 * Analyzes patterns to find suspicious or irregular activity.
 * @param {Object} options
 * @param {string} options.category - Filter by category
 * @param {string} options.itemId - Filter by specific item
 * @param {number} options.days - Lookback period (default 30)
 */
export const detectAnomalies = async (options = {}) => {
    const Item = dbStore.get('Item');
    const StockMovement = dbStore.get('StockMovement');

    const { category, itemId, days = 30 } = options;
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const where = {};
    if (category) where.category = category;
    if (itemId) where.item_id = itemId;

    // 1. Fetch relevant items
    const items = await Item.findAll({
        where,
        attributes: ['item_id', 'sku_code', 'name', 'current_stock', 'cost_per_unit']
    });

    if (items.length === 0) return [];

    const anomalies = [];

    for (const item of items) {
        // Fetch movements for this item
        const movements = await StockMovement.findAll({
            where: {
                item_id: item.item_id,
                timestamp: { [Op.gte]: startDate }
            },
            order: [['timestamp', 'ASC']]
        });

        if (movements.length < 5) continue; // Need some history for stats

        // --- Check 1: Excessive Loss Events ---
        // Rule: Any single 'calculated_loss' or 'adjustment' (negative) > 5% of current stock OR > 3x average loss
        const losses = movements
            .filter(m => ['calculated_loss', 'waste', 'spoilage', 'damage'].includes(m.movement_type) || (m.movement_type === 'adjustment' && m.quantity < 0))
            .map(m => ({ ...m.dataValues, qty: Math.abs(parseFloat(m.quantity)) }));

        if (losses.length > 0) {
            const totalLoss = losses.reduce((sum, m) => sum + m.qty, 0);
            const avgLoss = totalLoss / losses.length;

            for (const loss of losses) {
                // Threshold: > 5% of current stock (if stock > 0) OR > 3x average loss (if significant)
                const percentOfStock = item.current_stock > 0 ? (loss.qty / item.current_stock) : 1;

                if (loss.qty > 0 && (percentOfStock > 0.05 || (losses.length > 2 && loss.qty > avgLoss * 3))) {
                    anomalies.push({
                        type: 'HIGH_LOSS_EVENT',
                        severity: percentOfStock > 0.1 ? 'CRITICAL' : 'WARNING',
                        item_id: item.item_id,
                        name: item.name,
                        details: `Unusual loss of ${loss.qty} units on ${new Date(loss.timestamp).toLocaleDateString()}. Average loss is ${avgLoss.toFixed(2)}.`,
                        movement_id: loss.movement_id
                    });
                }
            }
        }

        // --- Check 2: Consumption Spikes ---
        // Rule: Daily consumption > Mean + 3*SD
        const consumptionByDay = {};
        movements
            .filter(m => m.movement_type === 'production_consumption')
            .forEach(m => {
                const day = new Date(m.timestamp).toISOString().split('T')[0];
                const qty = Math.abs(parseFloat(m.quantity));
                consumptionByDay[day] = (consumptionByDay[day] || 0) + qty;
            });

        const dailyValues = Object.values(consumptionByDay);
        if (dailyValues.length >= 3) {
            const mean = dailyValues.reduce((a, b) => a + b, 0) / dailyValues.length;
            const variance = dailyValues.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / dailyValues.length;
            const stdDev = Math.sqrt(variance);

            Object.entries(consumptionByDay).forEach(([day, qty]) => {
                // Z-Score > 3 is a strong anomaly (99.7% confidence)
                if (qty > 0 && qty > mean + (3 * stdDev)) {
                    anomalies.push({
                        type: 'CONSUMPTION_SPIKE',
                        severity: 'WARNING',
                        item_id: item.item_id,
                        name: item.name,
                        details: `Abnormal consumption of ${qty} units on ${day}. Normal range is up to ${(mean + 2 * stdDev).toFixed(1)}.`,
                        date: day
                    });
                }
            });
        }

        // --- Check 3: Frequent Adjustments ---
        // Rule: > 3 manual adjustments in the period
        const manualAdjustments = movements.filter(m => m.movement_type === 'adjustment');
        if (manualAdjustments.length > 3) {
            anomalies.push({
                type: 'FREQUENT_ADJUSTMENTS',
                severity: 'WARNING',
                item_id: item.item_id,
                name: item.name,
                details: `Item has been manually adjusted ${manualAdjustments.length} times in the last ${days} days. This may indicate process issues.`,
                count: manualAdjustments.length
            });
        }
    }

    return anomalies.sort((a, b) => (a.severity === 'CRITICAL' ? -1 : 1));
};

/**
 * Analyze Supplier Performance
 * Calculates metrics like On-Time Delivery Rate, Fill Rate, and Avg Lead Time.
 * @param {number} supplierId
 */
export const analyzeSupplierPerformance = async (supplierId) => {
    const PurchaseOrder = dbStore.get('PurchaseOrder');
    const Supplier = dbStore.get('Supplier');

    const supplier = await Supplier.findByPk(supplierId);
    if (!supplier) throw new Error('Supplier not found');

    const pos = await PurchaseOrder.findAll({
        where: {
            supplier_id: supplierId,
            status: { [Op.in]: ['received', 'closed'] }
        },
        order: [['order_date', 'DESC']]
    });

    const totalOrders = pos.length;
    if (totalOrders === 0) {
        return {
            supplier_id: supplierId,
            name: supplier.name,
            score: 'N/A',
            details: 'No completed purchase orders found for analysis.'
        };
    }

    let onTimeCount = 0;
    let totalLeadTime = 0;
    let leadTimeCount = 0;
    let totalSpend = 0;

    for (const po of pos) {
        totalSpend += parseFloat(po.total_amount || 0);

        if (po.received_date && po.expected_delivery_date) {
            const received = new Date(po.received_date);
            const expected = new Date(po.expected_delivery_date);
            if (received <= expected) onTimeCount++;
        }

        if (po.received_date && po.order_date) {
            const received = new Date(po.received_date);
            const ordered = new Date(po.order_date);
            const diffTime = Math.abs(received - ordered);
            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
            totalLeadTime += diffDays;
            leadTimeCount++;
        }
    }

    const onTimeRate = (onTimeCount / totalOrders) * 100;
    const avgLeadTime = leadTimeCount > 0 ? (totalLeadTime / leadTimeCount) : 0;

    return {
        supplier_id: supplierId,
        name: supplier.name,
        grade: onTimeRate >= 95 ? 'A' : onTimeRate >= 80 ? 'B' : onTimeRate >= 70 ? 'C' : 'F',
        metrics: {
            total_orders: totalOrders,
            total_spend: totalSpend,
            on_time_delivery_rate: `${onTimeRate.toFixed(1)}%`,
            avg_lead_time_days: avgLeadTime.toFixed(1),
            quality_rating: supplier.quality_rating || 'N/A'
        }
    };
};

/**
 * Analyze Inventory Costs (COGS & Waste)
 * @param {Object} options { startDate, endDate }
 */
export const analyzeInventoryCosts = async ({ startDate, endDate }) => {
    const StockMovement = dbStore.get('StockMovement');
    const Item = dbStore.get('Item');

    const sDate = startDate ? new Date(startDate) : new Date(new Date().setDate(new Date().getDate() - 30));
    const eDate = endDate ? new Date(endDate) : new Date();

    const movements = await StockMovement.findAll({
        where: {
            timestamp: { [Op.between]: [sDate, eDate] },
            movement_type: { [Op.in]: ['production_consumption', 'calculated_loss', 'waste', 'spoilage', 'damage'] }
        },
        include: [{
            model: Item,
            as: 'item',
            attributes: ['cost_per_unit', 'category']
        }]
    });

    let cogs = 0;
    let wasteValue = 0;
    const categoryBreakdown = {};

    for (const m of movements) {
        // Use historical cost if available, otherwise current item cost
        const cost = parseFloat(m.weighted_average_cost || m.item?.cost_per_unit || 0);
        const qty = Math.abs(parseFloat(m.quantity));
        const value = cost * qty;

        if (m.movement_type === 'production_consumption') {
            cogs += value;
        } else {
            wasteValue += value;
        }
    }

    return {
        period: {
            start: sDate.toISOString().split('T')[0],
            end: eDate.toISOString().split('T')[0]
        },
        summary: {
            total_cogs: cogs.toFixed(2),
            total_waste_value: wasteValue.toFixed(2),
            efficiency_ratio: cogs > 0 ? ((cogs / (cogs + wasteValue)) * 100).toFixed(1) + '%' : 'N/A'
        },
        note: "Calculations based on weighted average cost recorded at time of movement."
    };
};
