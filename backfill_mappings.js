import { Tenant, UserTenantMapping } from './backend/src/models/index.js';
import * as landlordService from './backend/src/services/landlordService.js';

async function backfill() {
    console.log('--- STARTING BACKFILL OF EMAIL MAPPINGS ---');
    try {
        const tenants = await Tenant.findAll();
        console.log(`Found ${tenants.length} tenants total.`);

        let createdCount = 0;
        for (const tenant of tenants) {
            if (tenant.admin_email) {
                const { created } = await landlordService.addEmailTenantMapping(tenant.admin_email, tenant.id);
                if (created) createdCount++;
            }
        }

        console.log(`Successfully backfilled ${createdCount} mappings.`);
        process.exit(0);
    } catch (err) {
        console.error('Backfill failed:', err);
        process.exit(1);
    }
}

backfill();
