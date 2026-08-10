
import db from '../src/models/index.js';
import bcrypt from 'bcryptjs';

const { User, Tenant } = db;

const createTestUsers = async () => {
    try {
        console.log('🌱 Seeding Test Users...');

        // 1. Create Standard Tenant & User
        const [standardTenant] = await Tenant.findOrCreate({
            where: { name: 'Standard Corp' },
            defaults: {
                domain: 'standard.test',
                plan: 'standard', // IMPORTANT: Standard Plan
                subscription_status: 'active',
                db_name: 'tenant_standard',
                company_token: 'std_' + Math.random().toString(36).substring(7),
                created_at: new Date(),
                updated_at: new Date()
            }
        });

        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash('Password123!', salt);

        const [standardUser] = await User.findOrCreate({
            where: { email: 'standard@test.com' },
            defaults: {
                username: 'standard_user',
                password_hash: hashedPassword,
                role: 'admin', // Admin of their own tenant
                tenant_id: standardTenant.id,
                is_active: true,
                created_at: new Date(),
                updated_at: new Date()
            }
        });

        console.log('✅ Standard User Ready: standard@test.com / Password123!');

        // 2. Create Premium Tenant & User
        const [premiumTenant] = await Tenant.findOrCreate({
            where: { name: 'Premium Corp' },
            defaults: {
                domain: 'premium.test',
                plan: 'premium', // IMPORTANT: Premium Plan
                subscription_status: 'active',
                db_name: 'tenant_premium',
                company_token: 'prem_' + Math.random().toString(36).substring(7),
                created_at: new Date(),
                updated_at: new Date()
            }
        });

        const [premiumUser] = await User.findOrCreate({
            where: { email: 'premium@test.com' },
            defaults: {
                username: 'premium_user',
                password_hash: hashedPassword,
                role: 'admin',
                tenant_id: premiumTenant.id,
                is_active: true,
                created_at: new Date(),
                updated_at: new Date()
            }
        });

        console.log('✅ Premium User Ready: premium@test.com / Password123!');

    } catch (error) {
        console.error('❌ Error creating test users:', error);
    } finally {
        process.exit();
    }
};

createTestUsers();
