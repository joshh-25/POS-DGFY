
import sequelize from '../src/config/database.js';
import '../src/models/index.js';

async function syncModels() {
    console.log('Syncing database models...');
    try {
        await sequelize.sync({ alter: true });
        console.log('✅ Models synced successfully.');
    } catch (error) {
        console.error('❌ Sync failed:', error);
    } finally {
        await sequelize.close();
        process.exit();
    }
}

syncModels();
