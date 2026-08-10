import { provisionTenant } from '../src/services/tenantProvisioningService.js';
import dbStore from '../src/utils/dbStore.js';
import sequelize from '../src/config/database.js';
import logger from '../src/config/logger.js';

const testProvisioning = async () => {
    try {
        await sequelize.authenticate();
        console.log('✅ Connected to Landlord DB');

        const Tenant = dbStore.get('Tenant');

        // Find the pending tenant
        const tenant = await Tenant.findOne({
            where: {
                name: 'Sigma Corp 2',
                status: 'pending'
            }
        });

        if (!tenant) {
            console.error('❌ Could not find pending tenant "Sigma Corp 2".');
            return;
        }

        console.log(`Found tenant: ${tenant.name} (${tenant.id})`);
        console.log('Starting provisioning...');

        const result = await provisionTenant({
            tenantId: tenant.id,
            name: tenant.name,
            dbName: tenant.db_name,
            companyToken: tenant.company_token,
            adminEmail: tenant.admin_email,
            adminPasswordHash: tenant.admin_password_hash
        });

        console.log('✅ Provisioning result:', result);

    } catch (error) {
        console.error('❌ Provisioning failed:', error);
    } finally {
        await sequelize.close();
    }
};

testProvisioning();
