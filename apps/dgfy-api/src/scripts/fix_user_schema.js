
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

// Load environment variables
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const envPath = path.resolve(__dirname, '../../.env');
dotenv.config({ path: envPath });

async function fixSchema() {
    console.log('🔧 Fixing User Table Schema...');
    // Dynamic import
    const { sequelize } = await import('../models/index.js');

    try {
        await sequelize.authenticate();
        console.log('✅ Connected to DB');

        // Add deleted_at
        try {
            await sequelize.query("ALTER TABLE `Users` ADD COLUMN `deleted_at` DATETIME NULL;");
            console.log('✅ Added deleted_at column');
        } catch (e) {
            if (e.original && e.original.code === 'ER_DUP_FIELDNAME') {
                console.log('ℹ️ deleted_at already exists');
            } else {
                console.error('❌ Failed to add deleted_at:', e.message);
            }
        }

        // Add deleted_by
        try {
            await sequelize.query("ALTER TABLE `Users` ADD COLUMN `deleted_by` INT NULL;");
            console.log('✅ Added deleted_by column');
        } catch (e) {
            if (e.original && e.original.code === 'ER_DUP_FIELDNAME') {
                console.log('ℹ️ deleted_by already exists');
            } else {
                console.error('❌ Failed to add deleted_by:', e.message);
            }
        }

        console.log('✨ Schema fix complete.');
        process.exit(0);

    } catch (error) {
        console.error('❌ Fatal error:', error);
        process.exit(1);
    }
}

fixSchema();
