const { Sequelize } = require('sequelize');
const bcrypt = require('bcryptjs');

// Configuration
const DB_HOST = '127.0.0.1';
const DB_USER = 'root';
const DB_PASS = '';
const TENANT_DB = 'sku_tenant_billing_test';

async function restoreAdmin() {
    const sequelize = new Sequelize(TENANT_DB, DB_USER, DB_PASS, {
        host: DB_HOST,
        dialect: 'mysql',
        logging: console.log
    });

    try {
        await sequelize.authenticate();
        console.log('Connected to tenant database.');

        const passwordHash = await bcrypt.hash('Password123!', 10);
        const email = 'billing-test@example.com';

        // Check if user exists
        const [users] = await sequelize.query(
            `SELECT * FROM Users WHERE email = ?`,
            { replacements: [email] }
        );

        if (users.length > 0) {
            console.log('User exists. Updating password...');
            await sequelize.query(
                `UPDATE Users SET password_hash = ?, role = 'admin', is_active = 1 WHERE email = ?`,
                { replacements: [passwordHash, email] }
            );
        } else {
            console.log('User does not exist. Creating...');
            await sequelize.query(
                `INSERT INTO Users (name, email, password_hash, role, is_active, created_at, updated_at) 
                 VALUES ('Billing Test Admin', ?, ?, 'admin', 1, NOW(), NOW())`,
                { replacements: [email, passwordHash] }
            );
        }

        console.log('✅ Admin access restored for:', email);

    } catch (error) {
        console.error('❌ Error restoring admin:', error);
    } finally {
        await sequelize.close();
    }
}

restoreAdmin();
