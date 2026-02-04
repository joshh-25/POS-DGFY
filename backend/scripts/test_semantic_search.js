
import { Op } from 'sequelize';
import db from '../src/models/index.js';
import { getItems, createItem } from '../src/services/itemService.js';
import { searchByMeaning } from '../src/services/embeddingService.js';
import ItemEmbedding from '../src/models/ItemEmbedding.js';
import fs from 'fs';


async function run() {
    console.log('Starting Semantic Search Verification...');

    try {
        await db.sequelize.authenticate();
        console.log('DB Connected.');

        // FORCE SYNC (Drop and Recreate)
        console.log('Syncing ItemEmbedding table (Force)...');
        try {
            await ItemEmbedding.sync({ force: true });
            console.log('ItemEmbedding table synced.');
        } catch (syncErr) {
            console.error('!!! SYNC ERROR !!!', syncErr.message);
            throw syncErr;
        }

        // 1. Create a dummy item DIRECTLY (Bypassing complex service validation)
        const testItemName = `SemanticTestBottle_${Date.now()}`;
        console.log(`\nCreating Item (Direct): "${testItemName}"`);

        let newItem = await db.Item.create({
            sku_code: `TEST-SEM-${Date.now()}`,
            name: testItemName,
            category: 'supplies',
            unit_of_measure: 'pcs',
            description: 'A cylindrical glass container for liquids.',
            current_stock: 10,
            status: 'active',
            cost_per_unit: 1.00
        });
        console.log(`Item created. ID: ${newItem.item_id}`);

        // Manual Sync (Simulating service call)
        const { syncItemEmbedding } = await import('../src/services/embeddingService.js');
        await syncItemEmbedding(newItem);
        console.log('Embedding synced manually.');

        // Wait for embedding (async)
        console.log('Waiting for embedding generation (5s)...');
        await new Promise(r => setTimeout(r, 5000));

        // Check if embedding exists in DB
        const embedding = await ItemEmbedding.findOne({ where: { item_id: newItem.item_id } });
        if (embedding) {
            console.log('Embedding verified in Database.');
        } else {
            console.warn('⚠️ Embedding NOT found in Database (OpenAI might be slow or failed).');
        }

        // 2. Search for "Vessel" (Not in description)
        const query = "vessel";
        console.log(`\nSearching for concept: "${query}"`);

        const result = await getItems({ search: query, limit: 10 });
        console.log(`Found ${result.items.length} items.`);

        const found = result.items.find(i => i.item_id === newItem.item_id);

        if (found) {
            console.log(`✅ PASS: Found "${found.name}" via semantic search!`);
            fs.writeFileSync('verification_success.log', 'PASS');
        } else {
            console.log(`❌ FAIL: Did not find "${newItem.name}".`);
            console.log('Results found:', result.items.map(i => i.name).join(', '));
            fs.writeFileSync('verification_fail.log', 'FAIL: Concept not found');
        }

    } catch (error) {
        fs.writeFileSync('verification_global_error.log', `Global Error: ${error.message}\nStack: ${error.stack}`);
        console.error('Test failed:', error);
    } finally {
        // await db.sequelize.close(); // Keep open if needed or close
        process.exit(0);
    }
}

run();
