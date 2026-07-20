
// Basic Verification Script for Analytics Service
// Usage: node scripts/verify-analytics.js

import sequelize from '../src/config/database.js';
import * as analyticsService from '../src/services/analyticsService.js';
import Item from '../src/models/Item.js';
import StockMovement from '../src/models/StockMovement.js';
import Supplier from '../src/models/Supplier.js';
import SupplierItem from '../src/models/SupplierItem.js';

// Helper to create test data
async function setupTestData() {
    console.log('--- Setting up Test Data ---');

    // 1. Create a test item "Coffee Beans"
    const item = await Item.create({
        name: 'Test Coffee Beans',
        sku_code: 'TEST-COFFEE-' + Date.now(),
        category: 'raw_material',
        unit_of_measure: 'kg',
        status: 'active',
        current_stock: 50 // Start with 50kg
    });
    console.log(`Created Item: ${item.name} (${item.sku_code})`);

    // 2. Create a supplier with 10 day lead time
    const supplier = await Supplier.create({
        name: 'Test Supplier ' + Date.now(),
        avg_delivery_days: 10
    });
    console.log(`Created Supplier: ${supplier.name} (Lead Time: 10 days)`);

    // 3. Link them
    await SupplierItem.create({
        item_id: item.item_id,
        supplier_id: supplier.supplier_id
    });

    // 4. Create mock consumption (Burn Rate)
    // Let's simulate:
    // Day 1: -5kg
    // Day 5: -5kg
    // Day 10: -5kg
    // Total 15kg over ~10 days.
    // Actually, burn rate looks back 30 days.
    // If we just add these records with recent timestamps, they count.
    // total consumed = 15. burn rate = 15/30 = 0.5 kg/day.

    await StockMovement.bulkCreate([
        { item_id: item.item_id, quantity: -5, movement_type: 'production_consumption', timestamp: new Date(Date.now() - 86400000 * 1) },
        { item_id: item.item_id, quantity: -5, movement_type: 'production_consumption', timestamp: new Date(Date.now() - 86400000 * 5) },
        { item_id: item.item_id, quantity: -5, movement_type: 'production_consumption', timestamp: new Date(Date.now() - 86400000 * 10) }
    ]);
    console.log('Created Mock Consumption: 15kg total');

    return item.item_id;
}

// Verification Logic
async function runVerification() {
    try {
        await sequelize.authenticate();
        // Sync models - using force:false to safe
        // Note: We assume tables exist.

        const itemId = await setupTestData();

        console.log('\n--- Running Analytics Analysis ---');
        const result = await analyticsService.calculateReorderPoint(itemId);

        console.log('Result:', JSON.stringify(result, null, 2));

        // Assertions
        // Burn Rate: 15kg / 30 days = 0.5 kg/day
        const expectedBurnRate = 0.5;
        const actualBurnRate = result.stats.daily_burn_rate;

        // Lead Time: 10 days
        // Lead Time Demand: 0.5 * 10 = 5 kg
        // Safety Stock: 5 * 0.5 = 2.5 kg -> ceil(2.5) = 3 kg (or exact 2.5 depending on logic)
        // My implementation: Math.ceil(safetyStock) -> Math.ceil(2.5) = 3
        // ROP: Lead Time Demand (5) + Safety Stock (2.5) = 7.5 -> Math.ceil(7.5) = 8

        console.log('\n--- Assertions ---');
        if (Math.abs(actualBurnRate - expectedBurnRate) < 0.01) console.log('✅ Burn Rate Correct (0.5)');
        else console.error(`❌ Burn Rate Mismatch: Expected ${expectedBurnRate}, Got ${actualBurnRate}`);

        const expectedROP = 8; // ceil(5 + 2.5)
        if (result.recommendation.reorder_point === expectedROP) console.log(`✅ ROP Correct (${expectedROP})`);
        else console.error(`❌ ROP Mismatch: Expected ${expectedROP}, Got ${result.recommendation.reorder_point}`);

        console.log('\nVerification Complete.');

    } catch (error) {
        console.error('Verification Failed:', error);
    } finally {
        await sequelize.close();
    }
}

runVerification();
