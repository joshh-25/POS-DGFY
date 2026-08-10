import * as itemGroupingService from '../src/services/itemGroupingService.js';
import * as itemService from '../src/services/itemService.js';
import db from '../src/models/index.js';
import logger from '../src/config/logger.js';

const runVerification = async () => {
    try {
        console.log('--- Inventory Grouping Verification ---');

        // 1. Create a folder
        const folderName = `Test Folder ${Date.now()}`;
        console.log(`Creating folder: ${folderName}...`);
        const createResult = await itemGroupingService.createFolder(folderName, 'Verification test folder');
        console.log('Create result:', createResult);

        // 2. List folders
        console.log('Listing folders...');
        const folders = await itemGroupingService.listFolders();
        console.log(`Found ${folders.length} folders.`);
        const testFolder = folders.find(f => f.name === folderName);
        if (!testFolder) throw new Error('Created folder not found in list');

        // 3. Get first 2 items
        console.log('Fetching items to move...');
        const { items } = await itemService.getItems({ limit: 2 });
        if (items.length === 0) {
            console.log('No items found to test moving. Skipping move tests.');
        } else {
            const itemIds = items.map(i => i.item_id);
            console.log(`Moving items [${itemIds.join(', ')}] to "${folderName}"...`);

            // 4. Assign items to folder
            const assignResult = await itemGroupingService.assignItemsToFolder(folderName, itemIds);
            console.log('Assign result:', assignResult);

            // 5. Verify folder details
            console.log('Verifying folder details...');
            const details = await itemGroupingService.getFolderDetails(folderName);
            console.log(`Folder "${folderName}" now has ${details.item_count} items.`);
            if (details.item_count !== itemIds.length) {
                throw new Error(`Expected ${itemIds.length} items in folder, but found ${details.item_count}`);
            }

            // 6. Verify item service include
            console.log('Verifying Item include in itemService...');
            const { rows: updatedItems } = await itemService.getItems({ limit: 10 });
            const movedItem = updatedItems.find(i => itemIds.includes(i.item_id));
            console.log(`Item "${movedItem.name}" folder:`, movedItem.folder?.name || 'NONE');
            if (movedItem.folder?.name !== folderName) {
                throw new Error('Item folder relation not showing up in itemService result');
            }
        }

        console.log('\n✅ Verification SUCCESSFUL!');
        process.exit(0);
    } catch (error) {
        console.error('\n❌ Verification FAILED!');
        console.error(error);
        process.exit(1);
    }
};

runVerification();
