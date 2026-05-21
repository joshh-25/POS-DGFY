
import { Sequelize, DataTypes } from 'sequelize';
import { v4 as uuidv4 } from 'uuid';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

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

const Tenant = sequelize.define('Tenant', {
    id: { type: DataTypes.UUID, primaryKey: true },
    name: { type: DataTypes.STRING },
    domain: { type: DataTypes.STRING },
    db_name: { type: DataTypes.STRING },
    company_token: { type: DataTypes.STRING },
    status: { type: DataTypes.STRING }, // Use STRING to avoid ENUM issues if mismatch
    admin_email: { type: DataTypes.STRING },
    plan: { type: DataTypes.STRING },
    subscription_status: { type: DataTypes.STRING }
}, {
    tableName: 'tenants',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    underscored: true
});

const UserTenantMapping = sequelize.define('UserTenantMapping', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    email: { type: DataTypes.STRING },
    tenant_id: { type: DataTypes.UUID }
}, {
    tableName: 'user_tenant_mappings',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    underscored: true
});

async function registerLegacyTenant() {
    try {
        await sequelize.authenticate();
        console.log('Connected to DB.');

        const existing = await Tenant.findOne({
            where: { db_name: 'sku_inventory_manager' }
        });

        if (existing) {
            console.log('Updating existing legacy tenant to Premium...');
            await existing.update({
                plan: 'premium',
                subscription_status: 'active'
            });
            console.log('✅ Updated.');
        } else {
            const newId = uuidv4();
            console.log(`Creating new legacy tenant with ID: ${newId}`);

            await Tenant.create({
                id: newId,
                name: 'Legacy Admin Corp',
                domain: 'legacy-admin',
                db_name: 'sku_inventory_manager',
                company_token: 'token-legacy-admin',
                status: 'active',
                admin_email: 'admin@test.com',
                plan: 'premium',
                subscription_status: 'active'
            });
            console.log('✅ Created Tenant Record.');

            // Check if mapping exists
            const existingMapping = await UserTenantMapping.findOne({
                where: { email: 'admin@test.com', tenant_id: newId }
            });

            if (!existingMapping) {
                await UserTenantMapping.create({
                    id: uuidv4(),
                    email: 'admin@test.com',
                    tenant_id: newId
                });
                console.log('✅ Created User Mapping.');
            }
        }
        process.exit(0);
    } catch (error) {
        console.error('Error:', error);
        process.exit(1);
    }
}

registerLegacyTenant();
