
import db from '../src/models/index.js';
import dbStore from '../src/utils/dbStore.js';

async function debugTenantList() {
    try {
        console.log('Connecting to database...');
        await db.sequelize.authenticate();
        console.log('Connected.');

        console.log('Testing dbStore.get("Tenant")...');
        const Tenant = dbStore.get('Tenant');

        if (!Tenant) {
            console.error('❌ Tenant model NOT found in dbStore');
        } else {
            console.log('✅ Tenant model found');
        }

        console.log('Attempting Tenant.findAll()...');
        const tenants = await Tenant.findAll({
            order: [['createdAt', 'DESC']],
            attributes: ['id', 'name', 'domain', 'company_token', 'status', 'admin_email', 'plan', 'createdAt'],
            logging: console.log
        });

        console.log(`✅ Successfully found ${tenants.length} tenants.`);
        tenants.forEach(t => {
            console.log(` - ${t.name} (${t.status}) - Plan: ${t.plan}`);
        });

    } catch (error) {
        console.error('❌ Error during debugging:');
        console.error(error);
    } finally {
        await db.sequelize.close();
    }
}

debugTenantList();
