import { Sequelize, DataTypes } from 'sequelize';
import bcrypt from 'bcryptjs';

const fixTenantAClean = async () => {
    const tenantDbName = 'sku_test_tenant_a';
    console.log(`Connecting to tenant DB: ${tenantDbName}`);

    const tenantSeq = new Sequelize(tenantDbName, process.env.DB_USER || 'root', process.env.DB_PASSWORD || '', {
        host: process.env.DB_HOST || 'localhost',
        dialect: 'mysql',
        logging: false
    });

    // Define Model to handle JSON serialization correctly
    const User = tenantSeq.define('User', {
        user_id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
        email: { type: DataTypes.STRING },
        permissions: { type: DataTypes.JSON },
        is_master_admin: { type: DataTypes.BOOLEAN }
    }, { tableName: 'users', timestamps: false });

    try {
        await tenantSeq.authenticate();

        const user = await User.findOne({ where: { email: 'admin@tenant-a.com' } });

        if (user) {
            console.log(`Found user: ${user.email}. Fixing permissions format...`);

            const ADMIN_PERMISSIONS = [
                "items:view", "items:create", "items:edit", "items:delete", "items:export", "items:import",
                "suppliers:view", "suppliers:create", "suppliers:edit", "suppliers:delete", "suppliers:export", "suppliers:import",
                "po:view", "po:create", "po:edit", "po:approve", "po:receive", "po:delete",
                "stock:view", "stock:adjust", "batches:view", "batches:edit",
                "settings:view", "settings:edit", "users:manage", "audit:view",
                "ai:chat", "reports:view", "reports:export", "jo:view", "jo:create", "jo:edit", "jo:approve", "jo:complete", "jo:delete"
            ];

            // Update using Model - Sequelize handles JSON serialization
            await user.update({
                permissions: ADMIN_PERMISSIONS,
                is_master_admin: true
            });

            console.log('✅ Permissions updated via Model (Clean JSON).');
        } else {
            console.error('❌ User not found.');
        }

    } catch (error) {
        console.error('❌ Error:', error);
    } finally {
        await tenantSeq.close();
    }
};

fixTenantAClean();
