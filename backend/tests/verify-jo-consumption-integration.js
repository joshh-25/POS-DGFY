import { createJobOrder, completeJobOrder } from '../src/services/jobOrderService.js';
import { createStockMovement } from '../src/services/stockMovementService.js';
import db, { sequelize, User, Item, Supplier, FIFOBatch, StockMovement, BatchTransaction, JobOrder, JOIngredient } from '../src/models/index.js';

async function verifyJOConsumption() {
    console.log('--- Starting JO Consumption Integration Verification ---');
    const transaction = await sequelize.transaction();

    try {
        // 1. Setup Data
        console.log('1. Setting up Test Data...');

        // Create User
        const user = await User.create({
            username: 'jo_test_user_' + Date.now(),
            password_hash: 'hash',
            email: `jo_test_${Date.now()}@example.com`,
            role: 'admin'
        }, { transaction });

        // Create 2 Ingredient Items (FIFO Enabled)
        const ing1 = await Item.create({
            sku_code: 'ING-1-' + Date.now(),
            name: 'Ingredient 1',
            category: 'ingredient',
            unit_of_measure: 'kg',
            current_stock: 0,
            fifo_enabled: true,
            cost_price: 10.00
        }, { transaction });

        const product = await Item.create({
            sku_code: 'PROD-' + Date.now(),
            name: 'Finished Product',
            category: 'product',
            product_type: 'retail',
            unit_of_measure: 'units',
            current_stock: 0,
            fifo_enabled: true,
            cost_price: 50.00, // Static cost
            shelf_life_days: 10
        }, { transaction });

        await transaction.commit(); // Commit setup so services can use them

        // 2. Stock In Ingredients (Create FIFO Batches)
        console.log('2. Receiving Ingredients (Batch A and Batch B)...');

        // Batch A: 100kg @ $10
        await createStockMovement({
            item_id: ing1.item_id,
            quantity: 100,
            movement_type: 'purchase_receipt',
            reference_type: 'MANUAL',
            cost_per_unit: 10.00,
            po_number: 'BATCH-A'
        }, user.user_id);

        // Batch B: 50kg @ $12 (More expensive, received LATER)
        // Small delay to ensure timestamp diff?
        await new Promise(r => setTimeout(r, 10));
        await createStockMovement({
            item_id: ing1.item_id,
            quantity: 50,
            movement_type: 'purchase_receipt',
            reference_type: 'MANUAL',
            cost_per_unit: 12.00,
            po_number: 'BATCH-B'
        }, user.user_id);

        // Verify Initial Stock
        const initialStock = await Item.findByPk(ing1.item_id);
        console.log(`   Ingredient Stock: ${initialStock.current_stock} (Expected: 150)`);

        // 3. Create Job Order (non-draft to get jo_number)
        console.log('3. Creating Job Order...');
        const joData = {
            product_id: product.item_id,
            quantity_to_produce: 10,
            start_date: new Date(),
            status: 'in_progress', // Non-draft to generate jo_number for reference tracking
            ingredients: [
                {
                    item_id: ing1.item_id,
                    quantity_required: 120 // Should consume all of Batch A (100) + 20 of Batch B
                }
            ]
        };

        const jo = await createJobOrder(joData, user.user_id);
        console.log(`   Created JO: ${jo.jo_number}`);

        // 4. Complete Job Order
        console.log('4. Completing Job Order...');

        const completedResult = await completeJobOrder(jo.jo_id, user.user_id, null, 'Integration Test Note');

        // 5. Verify Results
        console.log('5. Verifying Results...');

        // A. Ingredient Stock
        const finalIngStock = await Item.findByPk(ing1.item_id);
        console.log(`   Ingredient Stock After: ${finalIngStock.current_stock} (Expected: 30)`);
        if (parseFloat(finalIngStock.current_stock) !== 30) throw new Error('Ingredient stock incorrect');

        // B. Ingredient Batch Consumption (Crucial!)
        const batches = await FIFOBatch.findAll({ where: { item_id: ing1.item_id }, order: [['received_date', 'ASC']] });

        // Batch A (Oldest) should be FULLY consumed (100)
        console.log(`   Batch A Consumed: ${batches[0].quantity_consumed} (Expected: 100)`);
        if (parseFloat(batches[0].quantity_consumed) !== 100) throw new Error('FIFO Batch A consumption incorrect');

        // Batch B (Newer) should be PARTIALLY consumed (20)
        console.log(`   Batch B Consumed: ${batches[1].quantity_consumed} (Expected: 20)`);
        if (parseFloat(batches[1].quantity_consumed) !== 20) throw new Error('FIFO Batch B consumption incorrect');

        // C. Batch Transactions
        // Should verify that transactions link to the correct movements
        const movements = await StockMovement.findAll({
            where: { reference_id: jo.jo_number, item_id: ing1.item_id },
            include: [{ model: BatchTransaction, as: 'batchTransactions' }]
        });

        console.log(`   Consumption Movements: ${movements.length} (Expected: 1)`);
        const consumptionMvt = movements[0];
        console.log(`   Transactions in Movement: ${consumptionMvt.batchTransactions.length} (Expected: 2 - split across batches)`);
        if (consumptionMvt.batchTransactions.length !== 2) throw new Error('Batch Transaction split logging incorrect');

        // D. Product Output
        const finalProdStock = await Item.findByPk(product.item_id);
        console.log(`   Product Stock: ${finalProdStock.current_stock} (Expected: 10)`);
        if (parseFloat(finalProdStock.current_stock) !== 10) throw new Error('Product output stock incorrect');

        const prodMvt = await StockMovement.findOne({
            where: { reference_id: jo.jo_number, item_id: product.item_id }
        });
        console.log(`   Product Movement Type: ${prodMvt.movement_type} (Expected: production_output)`);
        if (prodMvt.movement_type !== 'production_output') throw new Error('Product movement type incorrect');

        console.log('\n✅ VERIFICATION SUCCESSFUL: JO Consumption correctly uses stockMovementService!');

    } catch (error) {
        console.error('\n❌ VERIFICATION FAILED:', error);
        process.exit(1);
    }
}

verifyJOConsumption();
