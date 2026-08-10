
import sequelize from '../src/config/database.js';
import { PurchaseOrder, POLineItem, Item, FIFOBatch, StockMovement, Supplier, User } from '../src/models/index.js';
import * as purchaseOrderService from '../src/services/purchaseOrderService.js';
import * as itemService from '../src/services/itemService.js';

async function verifyFifoFlow() {
    try {
        console.log('--- Starting FIFO Verification ---');

        // 1. Create User
        const user = await User.findOne(); // Use existing user
        if (!user) throw new Error('No user found');

        // 2. Create Supplier
        const supplier = await Supplier.findOne(); // Use existing
        if (!supplier) throw new Error('No supplier found');

        // 3. Create Item (FIFO Enabled)
        console.log('Creating Test Item...');
        const item = await Item.create({
            sku_code: 'TEST-FIFO-' + Date.now(),
            name: 'Test FIFO Item ' + Date.now(),
            category: 'raw_material',
            unit_of_measure: 'kg',
            fifo_enabled: true,
            shelf_life_days: 90
            // Note: status field doesn't exist in Item model, removed
            // Note: product_type omitted for non-product categories
        });

        // 4. Create PO
        console.log('Creating PO...');
        const po = await purchaseOrderService.createPurchaseOrder({
            supplier_id: supplier.supplier_id,
            expected_delivery_date: '2026-02-01',
            line_items: [
                { item_id: item.item_id, quantity_ordered: 100, unit_price: 10 }
            ]
        }, user.user_id);
        // Service returns PO with lineItems already included

        // 5. Receive PO with Notes
        console.log('Receiving PO with Notes...');
        const receiptData = {
            line_items: [
                {
                    line_item_id: po.lineItems[0].line_item_id,
                    quantity_received: 100,
                    expiry_date: '2026-05-01'
                }
            ],
            notes: 'Test Receipt Note',
            delivery_rating: 5,
            status: 'received'
        };

        // We need to fetch the fresh PO to be sure we have the object expected by service
        // Actually purchaseOrderService.receivePurchaseOrder takes poId and data.
        const updatedPO = await purchaseOrderService.receivePurchaseOrder(po.po_id, receiptData, user.user_id);

        // 6. Verification
        console.log('--- Verification Results ---');

        // Check PO Notes
        const finalPO = await PurchaseOrder.findByPk(po.po_id);
        console.log(`PO Notes: "${finalPO.notes}"`);
        if (finalPO.notes !== 'Test Receipt Note') console.error('FAIL: PO Notes mismatch');
        else console.log('PASS: PO Notes saved');

        // Check Batch
        const batches = await FIFOBatch.findAll({ where: { item_id: item.item_id } });
        console.log(`Batches Found: ${batches.length}`);

        if (batches.length === 1) {
            const batch = batches[0];
            console.log(`Batch Notes: "${batch.notes}"`);
            if (batch.notes !== 'Test Receipt Note') console.error('FAIL: Batch Notes mismatch');
            else console.log('PASS: Batch Notes saved');
        } else {
            console.error('FAIL: No batch created');
        }

        // Cleanup
        // await item.destroy({ force: true });
        // await po.destroy({ force: true });
        // console.log('Cleanup complete');

    } catch (error) {
        console.error('Verification Failed:', error);
    }
}

verifyFifoFlow()
    .then(() => process.exit(0))
    .catch(err => { console.error(err); process.exit(1); });
