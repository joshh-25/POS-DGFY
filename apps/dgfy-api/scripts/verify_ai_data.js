import * as aiToolExecutor from '../src/services/aiToolExecutor.js';
import dbStore from '../src/utils/dbStore.js';
import logger from '../src/config/logger.js';
import dotenv from 'dotenv';

dotenv.config();

async function verify() {
    console.log('--- DATA EXPOSURE VERIFICATION ---');

    // Mock user
    const user = { user_id: 1 };

    try {
        // 1. Get some items to find a product
        console.log('Fetching items...');
        const itemsResult = await aiToolExecutor.execute('get_items', { category: 'product', limit: 5 }, user);

        if (!itemsResult.items || itemsResult.items.length === 0) {
            console.log('No products found to test. Skipping detail check.');
            return;
        }

        const testItem = itemsResult.items[0];
        console.log(`Testing product: ${testItem.name} (ID: ${testItem.id})`);

        // Check if fields exist in list view
        console.log('Checking fields in list view:');
        console.log(' - batch_size:', testItem.batch_size);
        console.log(' - yield_percentage:', testItem.yield_percentage);
        console.log(' - processing_loss:', testItem.processing_loss);

        // 2. Get full details
        console.log('\nFetching details...');
        const details = await aiToolExecutor.execute('get_item_details', { item_id: testItem.id }, user);

        console.log('Checking fields in detail view:');
        console.log(' - batch_size:', details.batch_size);
        console.log(' - yield_percentage:', details.yield_percentage);
        console.log(' - processing_loss:', details.processing_loss);

        if (details.batch_size !== undefined) {
            console.log('\nSUCCESS: Fields are exposed to the AI.');
        } else {
            console.log('\nFAILURE: Fields are missing from detail view.');
        }

    } catch (error) {
        console.error('Verification failed with error:', error);
    } finally {
        process.exit();
    }
}

verify();
