
import sequelize from '../src/config/database.js';
import db from '../src/models/index.js';

const { WebhookLog, Tenant } = db;

async function runForceSync() {
    console.log('Force syncing new/updated models...');
    try {
        // Create WebhookLog table if it doesn't exist
        await WebhookLog.sync({ alter: true });
        console.log('✅ WebhookLog table ready.');

        // Update Tenant table (add columns if missing)
        // We use alter: true here specifically for Tenant
        await Tenant.sync({ alter: true });
        console.log('✅ Tenant table updated.');

    } catch (error) {
        console.error('❌ Sync failed:', error);
    } finally {
        await sequelize.close();
        process.exit();
    }
}

runForceSync();
