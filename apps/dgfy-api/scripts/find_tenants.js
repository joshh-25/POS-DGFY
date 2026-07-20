import { Tenant } from '../src/models/index.js';

Tenant.findAll({ raw: true })
    .then(tenants => {
        console.log('--- TENANTS ---');
        tenants.forEach(t => {
            console.log(`ID: ${t.id} | Name: ${t.name} | Token: ${t.company_token}`);
        });
        console.log('---------------');
        process.exit(0);
    })
    .catch(err => {
        console.error(err);
        process.exit(1);
    });
