import sequelize from '../config/database.js';
import Item from '../models/Item.js';
import StockMovement from '../models/StockMovement.js';
import { Op } from 'sequelize';

const cleanupAnomalies = async () => {
    try {
        await sequelize.authenticate();
        console.log('Database connected.');

        // 1. Delete Test Item (Cascading delete might happen, but better valid explicitly)
        const item = await Item.findOne({
            where: { sku_code: 'TEST-ANOMALY-001' }
        });

        if (item) {
            // Delete movements
            await StockMovement.destroy({
                where: { item_id: item.item_id }
            });
            console.log(`Deleted movements for ${item.name}`);

            // Delete item
            await item.destroy();
            console.log(`Deleted item: ${item.name}`);
        } else {
            console.log('Test item not found.');
        }

        process.exit(0);

    } catch (error) {
        console.error('Cleanup failed:', error);
        process.exit(1);
    }
};

cleanupAnomalies();
