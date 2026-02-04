import { Sequelize } from 'sequelize';
import bcrypt from 'bcryptjs';
import dbStore from '../src/utils/dbStore.js';
import sequelize from '../src/config/database.js'; // Landlord DB

const fixTenantA = async () => {
    const tenantDbName = 'sku_test_tenant_a';
    const email = 'admin@tenant-a.com'; // Or admin@test.com if that was the original
    // The user screenshot showed admin@tenant-a.com in credentials but said "I used admin@test.com".
    // I will check which one exists or update the existing one.
    // Based on previous inspections, the user in DB was 'admin@tenant-a.com' (implied by "admin@tenant-a.com" in implementation plan analysis).
    // Actually, let's double check Step 2084 output. 
    // Wait, Step 2084 output for 'SELECT * FROM users' was truncated:
    // "username": "admin", "email": "admin@tenant-a.com" ??? -> No, checked Inspect User output.
    // The previous output (Step 2084) showed "last_login", "is_master_admin": 1 (Wait, it showed 1?).
    // Ah, Step 2084 output was:
    // `    "is_master_admin": 1`
    // So it WAS 1.
    // But `permissions` was `null`.

    // So I need to set permissions and fix password.

    const newPassword = 'Admin123!';
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(newPassword, salt);

    const ADMIN_PERMISSIONS = [
        "items:view", "items:create", "items:edit", "items:delete", "items:export", "items:import",
        "suppliers:view", "suppliers:create", "suppliers:edit", "suppliers:delete", "suppliers:export", "suppliers:import",
        "po:view", "po:create", "po:edit", "po:approve", "po:receive", "po:delete",
        "stock:view", "stock:adjust", "batches:view", "batches:edit",
        "settings:view", "settings:edit", "users:manage", "audit:view",
        "ai:chat", "reports:view", "reports:export", "jo:view", "jo:create", "jo:edit", "jo:approve", "jo:complete", "jo:delete"
    ];

    try {
        // 1. Connect to Tenant DB
        console.log(`Connecting to tenant DB: ${tenantDbName}`);
        const tenantSeq = new Sequelize(tenantDbName, process.env.DB_USER || 'root', process.env.DB_PASSWORD || '', {
            host: process.env.DB_HOST || 'localhost',
            dialect: 'mysql',
            logging: false
        });

        // Update User in Tenant DB
        // We target the existing admin user. I'll search by role 'admin' since email might vary.
        const [users] = await tenantSeq.query("SELECT * FROM users WHERE role = 'admin' LIMIT 1");

        if (users.length > 0) {
            const user = users[0];
            console.log(`Found admin user: ${user.email} (ID: ${user.user_id})`);

            await tenantSeq.query(
                "UPDATE users SET password_hash = :hash, permissions = :perms, is_master_admin = 1, is_active = 1 WHERE user_id = :id",
                {
                    replacements: {
                        hash: hashedPassword,
                        perms: JSON.stringify(ADMIN_PERMISSIONS),
                        id: user.user_id
                    }
                }
            );
            console.log('✅ Updated Tenant A User credentials and permissions.');

            // 2. Sync to Landlord DB
            await sequelize.authenticate();
            await sequelize.query(
                "UPDATE tenants SET admin_email = :email, admin_password_hash = :hash WHERE company_token = 'token-tenant-a'",
                {
                    replacements: {
                        email: user.email,
                        hash: hashedPassword
                    }
                }
            );
            console.log('✅ Synced Landlord DB record.');

        } else {
            console.error('❌ No admin user found in Tenant A DB!');
        }

        await tenantSeq.close();
        await sequelize.close();

    } catch (error) {
        console.error('❌ Error:', error);
    }
};

fixTenantA();
