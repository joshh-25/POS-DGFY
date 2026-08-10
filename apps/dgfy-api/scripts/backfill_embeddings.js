
import db from '../src/models/index.js';
import { syncItemEmbedding } from '../src/services/embeddingService.js';

async function runBackfill() {
    console.log('Starting Embedding Backfill for Existing Inventory...');

    try {
        await db.sequelize.authenticate();
        console.log('DB Connected.');

        // 1. Get all active items
        const items = await db.Item.findAll({
            where: { status: 'active' },
            attributes: ['item_id', 'name', 'category', 'sku_code', 'description', 'unit_of_measure']
        });

        console.log(`Found ${items.length} active items to process.`);

        let successCount = 0;
        let failCount = 0;

        // 2. Process sequentially to avoid rate limits
        for (const [index, item] of items.entries()) {
            process.stdout.write(`Processing ${index + 1}/${items.length}: ${item.name}... `);

            try {
                await syncItemEmbedding(item);
                console.log('✅ Done');
                successCount++;
            } catch (err) {
                console.log(`❌ Failed: ${err.message}`);
                failCount++;
            }

            // Small delay to be nice to API
            await new Promise(r => setTimeout(r, 200));
        }

        console.log('\n--- Backfill Complete ---');
        console.log(`Success: ${successCount}`);
        console.log(`Failed: ${failCount}`);

    } catch (error) {
        console.error('Backfill fatal error:', error);
    } finally {
        await db.sequelize.close();
    }
}

runBackfill();
