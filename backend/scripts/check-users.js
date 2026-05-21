
import { User, Tenant, UserTenantMapping } from '../src/models/index.js';
import db from '../src/models/index.js';

const checkUsers = async () => {
    try {
        console.log('--- CHECKING TENANTS ---');
        const tenants = await Tenant.findAll({
            where: {
                name: ['Standard Corp', 'Premium Corp']
            }
        });

        // Fix tenant status if not active
        for (const t of tenants) {
            if (t.status !== 'active') {
                console.log(`⚠️ Tenant ${t.name} is not active (status: ${t.status}). Updating to 'active'...`);
                t.status = 'active';
                await t.save();
                console.log(`✅ Tenant ${t.name} updated to active.`);
            }
        }

        const standardTenant = tenants.find(t => t.name === 'Standard Corp');
        const premiumTenant = tenants.find(t => t.name === 'Premium Corp');

        if (!standardTenant || !premiumTenant) {
            console.error('CRITICAL: Missing test tenants. Please run seed script first.');
            return;
        }
        console.log('Tenants found:', tenants.map(t => `${t.name} (${t.id})`).join(', '));

        console.log('\n--- CHECKING USERS ---');
        const emails = ['standard@test.com', 'premium@test.com'];
        const users = await User.findAll({
            where: {
                email: emails
            }
        });

        if (users.length === 0) {
            console.error('CRITICAL: Missing test users.');
            return;
        }

        users.forEach(u => console.log(`User: ${u.email} (ID: ${u.user_id})`));

        console.log('\n--- CHECKING & FIXING MAPPINGS ---');

        const checkAndFixMapping = async (email, tenant) => {
            const mapping = await UserTenantMapping.findOne({
                where: { email, tenant_id: tenant.id }
            });

            if (mapping) {
                console.log(`✅ Mapping exists: ${email} -> ${tenant.name}`);
            } else {
                console.log(`❌ Mapping MISSING: ${email} -> ${tenant.name}. Creating...`);
                await UserTenantMapping.create({
                    email,
                    tenant_id: tenant.id,
                    user_id: 0 // Optional or derived, model usually just needs email/tenant_id
                });
                console.log(`✨ Created mapping for ${email}`);
            }
        };

        await checkAndFixMapping('standard@test.com', standardTenant);
        await checkAndFixMapping('premium@test.com', premiumTenant);

    } catch (error) {
        console.error('Error checking users:', error);
    }
};

checkUsers();
