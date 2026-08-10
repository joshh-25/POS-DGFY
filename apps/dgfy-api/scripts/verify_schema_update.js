
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
        logging: false
    }
);

async function verifySchema() {
    try {
        await sequelize.authenticate();
        console.log('Database connection established.');

        const [results] = await sequelize.query('DESCRIBE tenants');
        const columns = results.map(r => r.Field);

        const expectedColumns = ['plan', 'subscription_status', 'paypal_subscription_id', 'current_period_end', 'trial_ends_at'];
        const missing = expectedColumns.filter(c => !columns.includes(c));

        if (missing.length > 0) {
            console.error('❌ Missing columns in tenants table:', missing);
        } else {
            console.log('✅ All subscription columns present in tenants table.');
        }

        const [paymentTable] = await sequelize.query("SHOW TABLES LIKE 'payments'");
        if (paymentTable.length > 0) {
            console.log('✅ Payments table exists.');
        } else {
            console.error('❌ Payments table missing.');
        }

        process.exit(missing.length > 0 || paymentTable.length === 0 ? 1 : 0);
    } catch (error) {
        console.error('Verification failed:', error);
        process.exit(1);
    }
}

verifySchema();
