
// Verification Script for Advanced Analytics
// Usage: node scripts/verify-advanced-analytics.js

import sequelize from '../apps/dgfy-api/src/config/database.js';
import * as analyticsService from '../apps/dgfy-api/src/services/analyticsService.js';
import Supplier from '../apps/dgfy-api/src/models/Supplier.js';
import PurchaseOrder from '../apps/dgfy-api/src/models/PurchaseOrder.js';
import StockMovement from '../apps/dgfy-api/src/models/StockMovement.js';
import Item from '../apps/dgfy-api/src/models/Item.js';

async function setupTestData() {
    console.log('--- Setting up Test Data ---');

    // 1. Supplier Performance Data
    const supplier = await Supplier.create({ name: 'Test Analytics Supplier ' + Date.now() });

    // PO 1: On Time
    await PurchaseOrder.create({
        supplier_id: supplier.supplier_id,
        order_date: '2023-01-01',
        expected_delivery_date: '2023-01-10',
        received_date: '2023-01-08', // Early/On-time
        status: 'received',
        total_amount: 500
    });

    // PO 2: Late
    await PurchaseOrder.create({
        supplier_id: supplier.supplier_id,
        order_date: '2023-01-01',
        expected_delivery_date: '2023-01-10',
        received_date: '2023-01-15', // Late
        status: 'received',
        total_amount: 500
    });

    // 2. Cost Analysis Data
    const item = await Item.create({
        name: 'Cost Test Item',
        sku_code: 'COST-TEST-' + Date.now(),
        category: 'raw_material',
        unit_of_measure: 'kg'
    });

    // Consumption (COGS): 10 units @ $5.00
    await StockMovement.create({
        item_id: item.item_id,
        quantity: -10,
        movement_type: 'production_consumption',
        weighted_average_cost: 5.00,
        timestamp: new Date()
    });

    // Waste: 2 units @ $5.00
    await StockMovement.create({
        item_id: item.item_id,
        quantity: -2,
        movement_type: 'waste',
        weighted_average_cost: 5.00,
        timestamp: new Date()
    });

    console.log('Created Mock Data: Supplier POs (50% on-time), Stock Movements (COGS $50, Waste $10)');

    return { supplierId: supplier.supplier_id };
}

async function runVerification() {
    try {
        await sequelize.authenticate();
        const { supplierId } = await setupTestData();

        // 1. Verify Supplier Analysis
        console.log('\n--- Analyzing Supplier Performance ---');
        const supplierStats = await analyticsService.analyzeSupplierPerformance(supplierId);
        console.log('Supplier Stats:', JSON.stringify(supplierStats, null, 2));

        if (supplierStats.metrics.on_time_delivery_rate === '50.0%') console.log('✅ On-Time Rate Correct (50.0%)');
        else console.error(`❌ On-Time Rate Mismatch: ${supplierStats.metrics.on_time_delivery_rate}`);

        // 2. Verify Cost Analysis
        console.log('\n--- Analyzing Inventory Costs ---');
        const costStats = await analyticsService.analyzeInventoryCosts({});
        console.log('Cost Stats (Summary):', JSON.stringify(costStats.summary, null, 2));

        // Note: This sums ALL movements in DB, so we look for *at least* our test data values
        const cogs = parseFloat(costStats.summary.total_cogs);
        const waste = parseFloat(costStats.summary.total_waste_value);

        // We know we added $50 COGS and $10 Waste. Total in DB might be higher if previous tests ran.
        if (cogs >= 50.00) console.log('✅ COGS Calculation Verified (>= $50)');
        else console.error(`❌ COGS too low: ${cogs}`);

        if (waste >= 10.00) console.log('✅ Waste Calculation Verified (>= $10)');
        else console.error(`❌ Waste too low: ${waste}`);

    } catch (error) {
        console.error('Verification Failed:', error);
    } finally {
        await sequelize.close();
    }
}

runVerification();
