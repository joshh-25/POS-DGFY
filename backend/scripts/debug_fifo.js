
import db from '../src/models/index.js';

const { sequelize, Item, FIFOBatch, StockMovement } = db;

const runDebug = async () => {
    try {
        console.log('Connecting to database...');
        await sequelize.authenticate();
        console.log('Connected.');

        // 1. Find the Item "ARTe"
        const item = await Item.findOne({
            where: { name: 'ARTe' },
            include: [{ model: FIFOBatch, as: 'fifoBatches' }]
        });

        if (!item) {
            console.log('ERROR: Item "ARTe" not found!');
            return;
        }

        console.log('\n=== ITEM DETAILS ===');
        console.log(`ID: ${item.item_id}`);
        console.log(`Name: ${item.name}`);
        console.log(`FIFO Enabled: ${item.fifo_enabled} (${typeof item.fifo_enabled})`);
        console.log(`Current Stock: ${item.current_stock}`);
        console.log(`Shelf Life: ${item.shelf_life_days} days`);

        // 2. Check Batches via Association
        console.log('\n=== BATCHES (via Association: Item.fifoBatches) ===');
        if (item.fifoBatches && item.fifoBatches.length > 0) {
            item.fifoBatches.forEach(b => {
                console.log(`- Batch ID: ${b.batch_id}, Qty: ${b.quantity}, Consumed: ${b.quantity_consumed}, Expiry: ${b.expiry_date}, PO: ${b.po_number}`);
            });
        } else {
            console.log('No batches found via association.');
        }

        // 3. Check Batches via Direct Query
        console.log('\n=== BATCHES (Direct Query: FIFOBatch.findAll) ===');
        const batches = await FIFOBatch.findAll({ where: { item_id: item.item_id } });
        if (batches.length > 0) {
            batches.forEach(b => {
                console.log(`- Batch ID: ${b.batch_id}, Qty: ${b.quantity}, Consumed: ${b.quantity_consumed}, Expiry: ${b.expiry_date}, PO: ${b.po_number}`);
            });
        } else {
            console.log('No batches found in fifo_batches table for this item_id.');
        }

        // 4. Check Stock Movements
        console.log('\n=== STOCK MOVEMENTS (Last 5) ===');
        const movements = await StockMovement.findAll({
            where: { item_id: item.item_id },
            order: [['timestamp', 'DESC']],
            limit: 5
        });

        movements.forEach(m => {
            console.log(`- ${m.timestamp}: ${m.movement_type} (${m.quantity}) ref: ${m.reference_id} BatchID: ${m.batch_id}`);
        });

    } catch (error) {
        console.error('Debug Error:', error);
    } finally {
        await sequelize.close();
    }
};

runDebug();
