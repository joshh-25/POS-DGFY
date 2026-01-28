import { createPurchaseOrder, receivePurchaseOrder } from '../src/services/purchaseOrderService.js';
import db, { sequelize, User, Item, Supplier, FIFOBatch, StockMovement } from '../src/models/index.js';

async function verifyPOReceipt() {
    console.log('--- Starting PO Receipt Integration Verification ---');

    const transaction = await sequelize.transaction();

    try {
        // 1. Setup Data
        console.log('1. Setting up Test Data...');

        // Create User
        const user = await User.create({
            username: 'test_po_user_' + Date.now(),
            password_hash: 'hashedpassword123',
            email: `test_po_${Date.now()}@example.com`,
            full_name: 'Test PO User',
            role: 'admin'
        }, { transaction });

        // Create Supplier
        const supplier = await Supplier.create({
            name: 'Test Supplier ' + Date.now(),
            contact_email: 'supplier@test.com'
        }, { transaction });

        // Create Item (FIFO Enabled)
        const item = await Item.create({
            sku_code: 'PO-TEST-' + Date.now(),
            name: 'PO Test Widget',
            category: 'product',
            product_type: 'retail',
            unit_of_measure: 'units',
            cost_price: 10.00,
            selling_price: 20.00,
            current_stock: 0,
            fifo_enabled: true,
            shelf_life_days: 30
        }, { transaction });

        // Commit setup so service functions can find them
        await transaction.commit();

        // 2. Create PO
        console.log('2. Creating Purchase Order...');
        const poData = {
            supplier_id: supplier.supplier_id,
            notes: 'Test PO for Integration',
            line_items: [
                {
                    item_id: item.item_id,
                    quantity_ordered: 10,
                    unit_price: 12.50 // Different from item cost (10.00) to test override
                }
            ]
        };

        const createdPO = await createPurchaseOrder(poData, user.user_id);
        console.log(`   Created PO: ${createdPO.po_number}`);

        // 3. Receive PO
        console.log('3. Receiving Purchase Order...');
        const receiptData = {
            line_items: [
                {
                    line_item_id: createdPO.lineItems[0].line_item_id,
                    quantity_received: 10
                }
            ],
            notes: 'Received fully'
        };

        await receivePurchaseOrder(createdPO.po_id, receiptData, user.user_id);

        // 4. Verify Results
        console.log('4. Verifying Results...');

        // A. Check Stock Update
        const updatedItem = await Item.findByPk(item.item_id);
        console.log(`   Item Stock: ${updatedItem.current_stock} (Expected: 10)`);
        if (parseFloat(updatedItem.current_stock) !== 10) throw new Error('Stock update failed');

        // B. Check FIFO Batch
        const batches = await FIFOBatch.findAll({ where: { item_id: item.item_id } });
        console.log(`   Batches Created: ${batches.length} (Expected: 1)`);
        if (batches.length !== 1) throw new Error('Batch creation failed');

        const batch = batches[0];
        console.log(`   Batch Cost: ${batch.cost_per_unit} (Expected: 12.50)`);
        if (parseFloat(batch.cost_per_unit) !== 12.50) throw new Error('Batch cost override failed');

        console.log(`   Batch PO: ${batch.po_number} (Expected: ${createdPO.po_number})`);
        if (batch.po_number !== createdPO.po_number) throw new Error('Batch PO number mismatch');

        // C. Check Stock Movement
        const movements = await StockMovement.findAll({ where: { reference_id: createdPO.po_number } });
        console.log(`   Movements Logged: ${movements.length} (Expected: 1)`);
        if (movements.length !== 1) throw new Error('Movement logging failed');

        const movement = movements[0];
        console.log(`   Movement Type: ${movement.movement_type} (Expected: purchase_receipt)`);
        if (movement.movement_type !== 'purchase_receipt') throw new Error('Wrong movement type');

        console.log('\n✅ VERIFICATION SUCCESSFUL: PO Receipt correctly triggers Stock Movement & FIFO Batch.');

        // Cleanup (optional, but good for local dev)
        // await updatedItem.destroy(); 
        // await batch.destroy();
        // await movement.destroy();
        // await User.destroy({ where: { user_id: user.user_id }});

    } catch (error) {
        if (!transaction.finished) await transaction.rollback();
        console.error('\n❌ VERIFICATION FAILED:', error);
        process.exit(1);
    }
}

verifyPOReceipt();
