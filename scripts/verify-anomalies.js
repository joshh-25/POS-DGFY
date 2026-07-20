
// Verification Script for Anomaly Detection
// Usage: node scripts/verify-anomalies.js

import sequelize from '../apps/dgfy-api/src/config/database.js';
import * as analyticsService from '../apps/dgfy-api/src/services/analyticsService.js';
import Item from '../apps/dgfy-api/src/models/Item.js';
import StockMovement from '../apps/dgfy-api/src/models/StockMovement.js';

async function setupTestData() {
    console.log('--- Setting up Test Data ---');

    // 1. Create a test item "Expensive Spices"
    const item = await Item.create({
        name: 'Exotic Saffron',
        sku_code: 'TEST-SAFFRON-' + Date.now(),
        category: 'raw_material',
        unit_of_measure: 'g',
        status: 'active',
        current_stock: 1000 // 1000g
    });

    // 2. Scenario A: Normal Consumption (Baseline)
    // Mean = 10, SD ~ small
    const movements = [];
    for (let i = 30; i > 0; i--) {
        movements.push({
            item_id: item.item_id,
            quantity: -10 + (Math.random() * 2), // 10-12g
            movement_type: 'production_consumption',
            timestamp: new Date(Date.now() - 86400000 * i)
        });
    }

    // 3. Scenario B: Consumption Spike (Anomaly)
    // Sudden usage of 100g (10x normal)
    movements.push({
        item_id: item.item_id,
        quantity: -100,
        movement_type: 'production_consumption',
        timestamp: new Date() // Today
    });

    // 4. Scenario C: High Loss Event (Theft?)
    // 300g lost via "calculated_loss" (30% of stock)
    movements.push({
        item_id: item.item_id,
        quantity: -300,
        movement_type: 'calculated_loss',
        loss_reason: 'pilferage',
        timestamp: new Date()
    });

    // 5. Scenario D: Frequent Adjustments
    // 5 manual adjustments today
    for (let i = 0; i < 5; i++) {
        movements.push({
            item_id: item.item_id,
            quantity: -1,
            movement_type: 'adjustment',
            timestamp: new Date()
        });
    }

    await StockMovement.bulkCreate(movements);
    console.log('Created Mock Data: Baseline + Spike + Theft + Adjustments');

    return item.item_id;
}

// Verification Logic
async function runVerification() {
    try {
        await sequelize.authenticate();
        const itemId = await setupTestData();

        console.log('\n--- Running Anomaly Detection ---');
        const anomalies = await analyticsService.detectAnomalies({
            itemId,
            days: 30
        });

        console.log('Detected Anomalies:', JSON.stringify(anomalies, null, 2));

        let detectedSpike = false;
        let detectedTheft = false;
        let detectedAdjustments = false;

        for (const a of anomalies) {
            if (a.type === 'CONSUMPTION_SPIKE') detectedSpike = true;
            if (a.type === 'HIGH_LOSS_EVENT') detectedTheft = true;
            if (a.type === 'FREQUENT_ADJUSTMENTS') detectedAdjustments = true;
        }

        console.log('\n--- Assertions ---');
        if (detectedSpike) console.log('✅ Detected Consumption Spike'); else console.error('❌ Missed Consumption Spike');
        if (detectedTheft) console.log('✅ Detected High Loss Event (Theft)'); else console.error('❌ Missed High Loss Event');
        if (detectedAdjustments) console.log('✅ Detected Frequent Adjustments'); else console.error('❌ Missed Frequent Adjustments');

    } catch (error) {
        console.error('Verification Failed:', error);
    } finally {
        await sequelize.close();
    }
}

runVerification();
