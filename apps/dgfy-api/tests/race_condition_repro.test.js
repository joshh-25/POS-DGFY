
import { createStockMovement } from '../src/services/stockMovementService.js';
import db, { sequelize, User, Item, FIFOBatch, StockMovement } from '../src/models/index.js';
import dbStore from '../src/utils/dbStore.js';

// Test helpers
let testUser;
let testItem;
const timestamp = Date.now();

beforeAll(async () => {
    // Create test user
    testUser = await User.create({
        username: 'race_test_user_' + timestamp,
        password_hash: 'hash',
        email: `race_test_${timestamp}@example.com`,
        phone_number: '+639170009999',
        role: 'admin'
    });
});

afterAll(async () => {
    // Cleanup
    if (testItem) {
        await StockMovement.destroy({ where: { item_id: testItem.item_id } });
        await FIFOBatch.destroy({ where: { item_id: testItem.item_id } });
        await Item.destroy({ where: { item_id: testItem.item_id } });
    }
    if (testUser) {
        await User.destroy({ where: { user_id: testUser.user_id } });
    }
    await sequelize.close();
});

describe('Stock Movement Race Condition', () => {
    it('should handle concurrent stock movements correctly', async () => {
        // 1. Setup: Create item with initial stock of 20
        const initialStock = 20;
        testItem = await Item.create({
            sku_code: 'RACE-TEST-' + timestamp,
            name: 'Race Test Item',
            category: 'raw_material',
            unit_of_measure: 'units',
            current_stock: initialStock,
            fifo_enabled: false, // Simple stock management for this test to isolate the race condition
            cost_price: 10.00
        });

        // 2. Execution: Run 10 concurrent requests to deduct 1 unit each
        const concurrency = 10;
        const deductionPerRequest = 1;
        const promises = [];

        console.log(`Starting ${concurrency} concurrent requests...`);

        await dbStore.run({ ...db, sequelize }, async () => {
            for (let i = 0; i < concurrency; i++) {
                promises.push(
                    createStockMovement({
                        item_id: testItem.item_id,
                        quantity: deductionPerRequest,
                        movement_type: 'production_consumption', // Deducts stock
                        reference_type: 'MANUAL',
                        notes: `Concurrent request ${i}`
                    }, testUser.user_id)
                );
            }

            await Promise.all(promises);
        });

        // 3. Assertion: Verify final stock
        // Expected: 20 - (10 * 1) = 10
        const finalItem = await Item.findByPk(testItem.item_id);
        const finalStock = parseFloat(finalItem.current_stock);

        console.log(`Initial Stock: ${initialStock}`);
        console.log(`Expected Final Stock: ${initialStock - (concurrency * deductionPerRequest)}`);
        console.log(`Actual Final Stock: ${finalStock}`);

        // This assertion should fail if the race condition exists
        expect(finalStock).toBe(initialStock - (concurrency * deductionPerRequest));
    });
});
