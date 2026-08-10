import { Sequelize } from 'sequelize';
import dotenv from 'dotenv';

dotenv.config();

const DB_CONFIG = {
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    dialect: 'mysql',
    logging: false
};

const MAPPINGS = [
    { email: 'standard@test.com', db: 'tenant_standard' },
    { email: 'premium@test.com', db: 'tenant_premium' }
];

async function seedDatabases() {
    console.log('🌱 Seeding Test Tenant Databases...');

    // 1. Connect to Landlord DB to get user data
    // Assuming Landlord DB is 'SKU' or defined in .env
    const landlordDbName = process.env.DB_NAME || 'SKU';
    const landlordSeq = new Sequelize(landlordDbName, DB_CONFIG.user, DB_CONFIG.password, {
        host: DB_CONFIG.host,
        dialect: DB_CONFIG.dialect,
        logging: false
    });

    try {
        for (const map of MAPPINGS) {
            console.log(`\nProcessing ${map.email}...`);

            // Placeholder from Landlord
            const [users] = await landlordSeq.query(`SELECT * FROM users WHERE email = '${map.email}'`);
            if (!users || users.length === 0) {
                console.error(`❌ User ${map.email} not found in Landlord DB!`);
                continue;
            }
            const user = users[0];
            console.log(`   Found user ID: ${user.user_id}`);

            // Connect to Tenant DB
            const tenantSeq = new Sequelize(map.db, DB_CONFIG.user, DB_CONFIG.password, {
                host: DB_CONFIG.host,
                dialect: DB_CONFIG.dialect,
                logging: false
            });

            // Insert User
            // We use REPLACE INTO to handle existing records
            // Construct columns and values dynamically
            const columns = Object.keys(user).map(k => `\`${k}\``).join(', ');
            // Handle values: strings need quotes, dates need handling, nulls need 'NULL'
            const values = Object.values(user).map(v => {
                if (v === null) return 'NULL';
                if (typeof v === 'string') return `'${v.replace(/'/g, "\\'")}'`; // Escape single quotes
                if (v instanceof Date) return `'${v.toISOString().slice(0, 19).replace('T', ' ')}'`;
                return v;
            }).join(', ');

            await tenantSeq.query(`REPLACE INTO users (${columns}) VALUES (${values})`);
            console.log(`   ✅ User seeded into ${map.db}`);

            // Seed dummy Item for forecast test (only for Premium to test 200 OK with data)
            if (map.db === 'tenant_premium') {
                const itemId = 1001;
                // Insert Item
                await tenantSeq.query(`
                    INSERT INTO items (item_id, name, sku_code, category, unit_of_measure, current_stock, min_threshold, status, created_at, updated_at)
                    VALUES (${itemId}, 'Premium Widget', 'PREM-001', 'product', 'pcs', 100, 10, 'active', NOW(), NOW())
                    ON DUPLICATE KEY UPDATE name='Premium Widget'
                 `);
                console.log(`   ✅ Item seeded into ${map.db}`);

                // Insert StockMovement (Consumption)
                await tenantSeq.query(`
                    INSERT INTO stock_movements (movement_id, item_id, user_responsible, movement_type, quantity, timestamp, created_at)
                    VALUES (2001, ${itemId}, ${user.user_id}, 'production_consumption', -10, NOW(), NOW())
                    ON DUPLICATE KEY UPDATE quantity=-10
                 `);
                console.log(`   ✅ Movement seeded into ${map.db}`);
            }


            await tenantSeq.close();
        }

    } catch (error) {
        console.error('❌ Error seeding databases:', error);
    } finally {
        await landlordSeq.close();
    }
}

seedDatabases();
