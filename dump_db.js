import { Tenant, UserTenantMapping } from './backend/src/models/index.js';
import fs from 'fs';

async function dump() {
    try {
        const tenants = await Tenant.findAll();
        const mappings = await UserTenantMapping.findAll();

        const output = {
            tenants: tenants.map(t => ({
                id: t.id,
                name: t.name,
                company_token: t.company_token,
                status: t.status,
                admin_email: t.admin_email
            })),
            mappings: mappings.map(m => ({
                email: m.email,
                tenant_id: m.tenant_id
            }))
        };

        fs.writeFileSync('tenant_dump.txt', JSON.stringify(output, null, 2));
        console.log('Dump successful');
        process.exit(0);
    } catch (err) {
        console.error('Dump failed:', err);
        process.exit(1);
    }
}

dump();
