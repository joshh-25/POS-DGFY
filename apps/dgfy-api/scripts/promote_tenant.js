
import { Sequelize, DataTypes } from 'sequelize';
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
    process.env.DB_PASSWORD || process.env.DB_PASS,
    {
        host: process.env.DB_HOST,
        dialect: 'mysql',
        logging: console.log
    }
);

// Minimal Tenant Model Definition
const Tenant = sequelize.define('Tenant', {
    id: { type: DataTypes.UUID, primaryKey: true },
    name: { type: DataTypes.STRING },
    admin_email: { type: DataTypes.STRING },
    plan: { type: DataTypes.ENUM('standard', 'premium') },
    subscription_status: { type: DataTypes.ENUM('active', 'inactive', 'past_due', 'cancelled', 'pending') },
    current_period_end: { type: DataTypes.DATE }
}, {
    tableName: 'tenants',
    underscored: true
});

async function promoteTenant(email) {
    try {
        await sequelize.authenticate();
        console.log('✅ Connected to Landlord Database.');

        const tenant = await Tenant.findOne({
            where: { admin_email: email }
        });

        if (!tenant) {
            console.error(`❌ No tenant found managed by email: ${email}`);
            process.exit(1);
        }

        console.log(`Found tenant: ${tenant.name} (${tenant.id})`);
        console.log(`Current Plan: ${tenant.plan}, Status: ${tenant.subscription_status}`);

        if (tenant.plan === 'premium' && tenant.subscription_status === 'active') {
            console.log('✅ Tenant is already PREMIUM and ACTIVE.');
        } else {
            console.log('Upgrading to PREMIUM...');
            await tenant.update({
                plan: 'premium',
                subscription_status: 'active',
                current_period_end: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000) // 1 year from now
            });
            console.log('✅ Upgrade Successful!');
            console.log(`New Plan: ${tenant.plan}, Status: ${tenant.subscription_status}`);
        }

        process.exit(0);

    } catch (error) {
        console.error('❌ Error promoting tenant:', error);
        process.exit(1);
    }
}

// Get email from CLI arg or default
const targetEmail = process.argv[2] || 'admin@test.com';
promoteTenant(targetEmail);
