
import { Sequelize } from 'sequelize';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

// Setup environment
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '../.env') });

const sequelize = new Sequelize(
    process.env.DB_NAME,
    process.env.DB_USER,
    process.env.DB_PASS,
    {
        host: process.env.DB_HOST,
        dialect: 'mysql',
        logging: console.log
    }
);

async function migrateTenants() {
    try {
        await sequelize.authenticate();
        console.log('Database connection established.');

        // 1. Schema Updates (Manual Fallback)
        console.log('Running schema updates...');

        // Add columns to tenants if missing
        try {
            await sequelize.query("ALTER TABLE tenants ADD COLUMN plan ENUM('standard', 'premium') DEFAULT 'standard' AFTER settings");
        } catch (e) { /* ignore if exists */ }

        try {
            await sequelize.query("ALTER TABLE tenants ADD COLUMN subscription_status ENUM('active', 'inactive', 'past_due', 'cancelled', 'pending') DEFAULT 'inactive' AFTER plan");
        } catch (e) { /* ignore if exists */ }

        try {
            await sequelize.query("ALTER TABLE tenants ADD COLUMN paypal_subscription_id VARCHAR(255) NULL AFTER subscription_status");
        } catch (e) { /* ignore if exists */ }

        try {
            await sequelize.query("ALTER TABLE tenants ADD COLUMN current_period_end DATETIME NULL AFTER paypal_subscription_id");
        } catch (e) { /* ignore if exists */ }

        try {
            await sequelize.query("ALTER TABLE tenants ADD COLUMN trial_ends_at DATETIME NULL AFTER current_period_end");
        } catch (e) { /* ignore if exists */ }

        // Create payments table if missing
        await sequelize.query(`
            CREATE TABLE IF NOT EXISTS payments (
                id CHAR(36) BINARY PRIMARY KEY,
                tenant_id CHAR(36) BINARY NOT NULL,
                transaction_id VARCHAR(255) NOT NULL UNIQUE,
                amount DECIMAL(10, 2) NOT NULL,
                currency VARCHAR(3) DEFAULT 'USD',
                status ENUM('completed', 'pending', 'failed', 'refunded') DEFAULT 'pending',
                payment_method VARCHAR(255) DEFAULT 'paypal',
                payment_date DATETIME DEFAULT CURRENT_TIMESTAMP,
                metadata JSON DEFAULT NULL,
                created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE ON UPDATE CASCADE
            )
        `);

        console.log('Schema updates completed.');

        console.log('Migrating existing tenants to PREMIUM plan...');

        // Update all existing tenants to premium and active
        const [results, metadata] = await sequelize.query(`
            UPDATE tenants 
            SET plan = 'premium', 
                subscription_status = 'active',
                updated_at = NOW()
            WHERE plan = 'standard' OR plan IS NULL OR plan = 'free'
        `);

        console.log(`Updated ${metadata.affectedRows} tenants to Premium plan.`);

        // Also ensure system settings for pricing exist
        console.log('Checking pricing settings...');
        const settings = [
            { key: 'PLAN_PRICE_STANDARD', value: '0.00', type: 'number', desc: 'Monthly price for Standard plan' },
            { key: 'PLAN_PRICE_PREMIUM', value: '29.99', type: 'number', desc: 'Monthly price for Premium plan' }
        ];

        for (const setting of settings) {
            const [results] = await sequelize.query(`
                SELECT * FROM system_settings WHERE setting_key = '${setting.key}'
            `);

            if (results.length === 0) {
                console.log(`Inserting default setting: ${setting.key}`);
                await sequelize.query(`
                    INSERT INTO system_settings (setting_key, setting_value, data_type, description, updated_at)
                    VALUES ('${setting.key}', '${setting.value}', '${setting.type}', '${setting.desc}', NOW())
                `);
            } else {
                console.log(`Setting ${setting.key} already exists.`);
            }
        }

        console.log('Migration completed successfully.');
        process.exit(0);
    } catch (error) {
        console.error('Migration failed:', error);
        process.exit(1);
    }
}

migrateTenants();
