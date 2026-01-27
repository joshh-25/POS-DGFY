import { Op } from 'sequelize';
import sequelize from '../src/config/database.js';
// Import models/index.js to ensure associations are initialized
import db from '../src/models/index.js';
const { Item, FIFOBatch } = db;
import * as alertService from '../src/services/alertService.js';

async function runTest() {
    console.log('Starting reproduction test...');
    let itemId = null;
    let batchId = null;

    try {
        // 1. Create a test item (active)
        const uniqueSuffix = Date.now();
        const item = await Item.create({
            name: `Test Item ${uniqueSuffix}`,
            sku_code: `TEST-${uniqueSuffix}`,
            category: 'product',
            product_type: 'finished_goods',
            status: 'active',
            fifo_enabled: true,
            unit_of_measure: 'pcs'
        });
        itemId = item.item_id;
        console.log(`Created test item: ${itemId}`);

        // 2. Create a batch with MISSING expiry date
        const batch = await FIFOBatch.create({
            item_id: itemId,
            quantity: 10,
            quantity_consumed: 0,
            received_date: new Date(),
            expiry_date: null // This triggers the alert
        });
        batchId = batch.batch_id;
        console.log(`Created test batch: ${batchId} with NULL expiry_date`);

        // 3. Verify it appears in alerts
        let alerts = await alertService.generateAlerts();
        let missingAlert = alerts.find(a => a.type === 'missing_expiry_date' && a.item_id === itemId);

        if (missingAlert) {
            console.log('PASS: Item initially found in alerts (Expected)');
        } else {
            console.error('FAIL: Item NOT found in alerts initially (Unexpected)');
            process.exit(1);
        }

        // 4. Soft delete the item
        await item.update({ status: 'inactive', deleted_at: new Date() });
        console.log('Soft deleted the item');

        // 5. Check alerts again
        alerts = await alertService.generateAlerts();
        missingAlert = alerts.find(a => a.type === 'missing_expiry_date' && a.item_id === itemId);

        if (missingAlert) {
            console.log('FAIL: Soft-deleted item STILL found in alerts (Bug Reproduced)');
        } else {
            console.log('PASS: Soft-deleted item NOT found in alerts (Fix Verified)');
        }

    } catch (error) {
        console.error('Test failed with error:', error);
    } finally {
        // Cleanup
        if (batchId) await FIFOBatch.destroy({ where: { batch_id: batchId }, force: true });
        if (itemId) await Item.destroy({ where: { item_id: itemId }, force: true });

        await sequelize.close();
    }
}

runTest();
