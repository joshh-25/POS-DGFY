
import db from '../src/models/index.js';

const checkTenant = async () => {
    try {
        console.log('Checking database for amorcrismel.hubomoto@gmail.com...');

        // Check Tenants table
        const tenant = await db.Tenant.findOne({
            where: {
                admin_email: 'amorcrismel.hubomoto@gmail.com'
            }
        });

        if (tenant) {
            console.log('✅ FOUND in Tenants table:');
            console.log(JSON.stringify(tenant.toJSON(), null, 2));
        } else {
            console.log('❌ NOT FOUND in Tenants table.');
        }

    } catch (error) {
        console.error('Error:', error);
    } finally {
        process.exit();
    }
};

checkTenant();
