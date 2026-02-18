import db from '../src/models/index.js';

async function setCorrectTenantDbs() {
    try {
        const Tenant = db.Tenant;

        console.log('Updating Standard Corp to tenant_standard...');
        await Tenant.update(
            { db_name: 'tenant_standard' },
            { where: { name: 'Standard Corp' } }
        );

        console.log('Updating Premium Corp to tenant_premium...');
        await Tenant.update(
            { db_name: 'tenant_premium' },
            { where: { name: 'Premium Corp' } }
        );

        console.log('✅ Tenants updated.');

    } catch (error) {
        console.error('Error:', error);
    } finally {
        process.exit(0);
    }
}

setCorrectTenantDbs();
