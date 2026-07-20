import fs from 'fs';
import db from '../src/models/index.js';

const inspectCompanies = async () => {
    let output = '';
    const log = (msg) => { output += msg + '\n'; };

    try {
        log('Connecting to database...');
        // Sync not needed for reading, but ensures connection
        db.sequelize.options.logging = false;
        await db.sequelize.authenticate();
        log('Connected.');

        log('\n--- EXTRACTING TENANT DATA ---');
        try {
            const tenants = await db.Tenant.findAll();
            if (tenants.length === 0) {
                log('No tenants found.');
            } else {
                tenants.forEach(t => {
                    log(`Tenant ID: ${t.id}`);
                    log(`Name: ${t.name}`);
                    log(`Domain: ${t.domain}`);
                    log(`DB Name: ${t.db_name}`);
                    log(`DB Host: ${t.db_host}`);
                    log(`Company Token: ${t.company_token}`);
                    log(`Settings: ${JSON.stringify(t.settings, null, 2)}`);
                    log('---');
                });
            }
        } catch (err) {
            log('Error querying tenants: ' + err.message);
        }

        log('\n--- EXTRACTING SUPPLIER DATA ---');
        try {
            const suppliers = await db.Supplier.findAll();
            if (suppliers.length === 0) {
                log('No suppliers found.');
            } else {
                suppliers.forEach(s => {
                    log(`Supplier ID: ${s.supplier_id}`);
                    log(`Name: ${s.name}`);
                    log(`Address: ${s.address}`);
                    log('---');
                });
            }
        } catch (err) {
            log('Error querying suppliers: ' + err.message);
        }

        fs.writeFileSync('company_data_dump.txt', output);
        console.log('Data written to company_data_dump.txt');

    } catch (error) {
        console.error('Fatal error:', error);
    } finally {
        await db.sequelize.close();
    }
};

inspectCompanies();
