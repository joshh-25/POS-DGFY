
import dbStore from '../src/utils/dbStore.js';
import * as aiService from '../src/services/aiService.js';
// We need to mock the toolExecutor because it will try to hit the DB
import * as toolExecutor from '../src/services/aiToolExecutor.js';

// Mock user and tenant
const mockUser = { user_id: 1, role: 'admin' };
// We don't need tenant_id in user, it comes from dbStore context
const mockTenant = { id: 2, name: 'Tenant Premium', db_name: 'tenant_premium', plan: 'premium' };

// Mock CSV Content
const csvContent = `sku_code,name,category,current_stock
TEST-AI-001,Test AI Item,raw_material,100`;

async function testImportWithContext() {
    console.log('--- Testing Import WITH Context ---');

    // We need to Initialize DB store if it's not already
    // But since we are running a script, we might need to manually connect
    // For this reproduction, we want to see if aiService *propagates* the context.

    // Let's wrap the execution in the store
    await dbStore.run(mockTenant, async () => {
        console.log('1. Context inside run:', dbStore.get('tenant')?.db_name);

        try {
            // 2. Simulate "executeConfirmedAction"
            const actionId = 'test-action-id';
            const pendingAction = {
                user_id: 1,
                toolName: 'import_csv_data',
                args: {
                    entity_type: 'items',
                    csv_content: csvContent,
                    options: {}
                },
                description: 'Import items',
                expires_at: new Date(Date.now() + 10000).toISOString()
            };

            // This function is what we are testing. 
            // deeper down it calls toolExecutor.execute -> csvImportService.confirmImport -> dbStore.get('Item')
            // If context is lost, dbStore.get('Item') will return default DB model or error.

            // We can't easily mock toolExecutor here without a library, but we can rely on the fact that
            // aiService imports toolExecutor. 

            // Actually, to truly reproduce, we need to see if `executeConfirmedAction` maintains the AsyncLocalStorage context
            // when it awaits.

            console.log('2. Calling executeConfirmedAction...');
            const result = await aiService.executeConfirmedAction(actionId, pendingAction, mockUser);

            console.log('3. Execution finished.');
            console.log('Result:', JSON.stringify(result, null, 2));

            // Verify if item exists in correct DB
            const Item = dbStore.get('Item');
            const item = await Item.findOne({ where: { sku_code: 'TEST-AI-001' } });

            if (item) {
                console.log('SUCCESS: Item found in context DB:', item.name);
            } else {
                console.log('FAILURE: Item NOT found in context DB.');
            }

        } catch (error) {
            console.error('Error during execution:', error);
        }
    });
}

testImportWithContext().then(() => {
    console.log('\nTest finished.');
    process.exit(0);
});
