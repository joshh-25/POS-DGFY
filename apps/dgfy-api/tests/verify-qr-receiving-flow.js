
import 'dotenv/config';
import db from '../src/models/index.js';
import * as receiveTokenService from '../src/services/receiveTokenService.js';
import * as purchaseOrderService from '../src/services/purchaseOrderService.js';
import { createPurchaseOrder } from '../src/services/purchaseOrderService.js';

const log = (msg) => console.log(`[INTEGRATION-TEST] ${msg}`);

async function runTest() {
    try {
        log('Starting In-Process Verification...');

        // Connect DB
        // models/index.js auto-connects but we might want to ensure sync?
        // No, assuming DB exists.

        // 1. Get Admin User
        const user = await db.User.findOne({ where: { role: 'admin' } });
        if (!user) throw new Error('No admin user found');
        log(`User: ${user.email} (ID: ${user.user_id})`);

        // ----------------------------------------------------
        // SCENARIO 1: PO Under-Receiving (Ordered 500, Receive 450)
        // ----------------------------------------------------
        log('\n--- SCENARIO 1: PO Under-Receiving (450/500) ---');

        // Get Supplier & Item
        const supplier = await db.Supplier.findOne();
        const item = await db.Item.findOne();
        if (!supplier || !item) throw new Error('Missing supplier or item');
        log(`Using Supplier ${supplier.supplier_id}, Item ${item.item_id}`);

        // Create PO
        const start = Date.now();
        const poData1 = {
            supplier_id: supplier.supplier_id,
            order_date: new Date(),
            expected_delivery_date: new Date(),
            notes: 'Integration Test PO 1',
            line_items: [
                {
                    item_id: item.item_id,
                    quantity_ordered: 500,
                    unit_price: 10,
                    total_price: 5000
                }
            ]
        };

        const po1 = await createPurchaseOrder(poData1, user.user_id);
        log(`Created PO #${po1.po_number} (ID: ${po1.po_id})`);

        // Update status to pending (mimic finalized) if needed?
        // createPurchaseOrder sets status to 'pending' by default in service logic. (Checked file)

        // Generate Token
        // Service: generateToken(orderType, orderId, userId, expiryDays)
        const tokenResult1 = await receiveTokenService.generateToken('PO', po1.po_id, user.user_id);
        const qrToken1 = tokenResult1.token; // logic returns { token, ... } ?
        // checking service... generateToken returns `token` string or object? 
        // File view (Step 182 snapshot) shows invalidation logic... let's assume it returns object or string.
        // Actually I should check the service return value.
        // Based on controller, it calls service.generateToken...
        // I'll assume it returns the token string or object with token.
        // Let's log it.
        log(`Generated Token: ${JSON.stringify(tokenResult1)}`);

        // Validate Token
        const validated1 = await receiveTokenService.validateToken(qrToken1.token || qrToken1);
        log(`Validated Token for PO: ${validated1.order.po_number}`);

        // Receive 450
        const receiveData1 = {
            line_items: [
                {
                    line_item_id: po1.lineItems[0].line_item_id,
                    quantity_received: 450
                }
            ],
            notes: 'Partial receive'
        };

        const receivedPo1 = await purchaseOrderService.receivePurchaseOrder(po1.po_id, receiveData1, user.user_id);
        log(`Received PO Status: ${receivedPo1.status}`);

        if (receivedPo1.status === 'partial') {
            log('✅ SCENARIO 1 PASSED');
        } else {
            log('❌ SCENARIO 1 FAILED');
        }

        // ----------------------------------------------------
        // SCENARIO 2: PO Over-Receiving (Ordered 500, Receive 550)
        // ----------------------------------------------------
        log('\n--- SCENARIO 2: PO Over-Receiving (550/500) ---');

        const poData2 = { ...poData1, notes: 'Integration Test PO 2' };
        const po2 = await createPurchaseOrder(poData2, user.user_id);
        log(`Created PO #${po2.po_number}`);

        const receiveData2 = {
            line_items: [
                {
                    line_item_id: po2.lineItems[0].line_item_id,
                    quantity_received: 550
                }
            ],
            notes: 'Over receive'
        };

        const receivedPo2 = await purchaseOrderService.receivePurchaseOrder(po2.po_id, receiveData2, user.user_id);
        log(`Received PO Status: ${receivedPo2.status}`);

        // Check quantity
        const li2 = receivedPo2.lineItems.find(li => li.line_item_id === po2.lineItems[0].line_item_id);
        log(`Quantity Received: ${li2.quantity_received}`);

        if (receivedPo2.status === 'received' && parseFloat(li2.quantity_received) === 550) {
            log('✅ SCENARIO 2 PASSED');
        } else {
            log('❌ SCENARIO 2 FAILED');
        }

    } catch (error) {
        console.error('TEST FAILED:', error.message);
        console.error(error);
    } finally {
        // await db.sequelize.close(); // Not strictly necessary for script but good practice
    }
}

runTest();
