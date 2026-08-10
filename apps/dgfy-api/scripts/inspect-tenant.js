import db from '../src/models/index.js';
import { Op } from 'sequelize';

async function inspectTenant() {
    try {
        console.log('Connecting to Landlord DB...');
        const Tenant = db.Tenant;

        console.log('Searching for Test Tenants...');
        const tenants = await Tenant.findAll({
            where: {
                name: { [Op.in]: ['Standard Corp', 'Premium Corp'] }
            }
        });

        console.log(`Found ${tenants.length} tenants.`);

        for (const tenant of tenants) {
            console.log('------------------------------------------------');
            console.log(`Tenant ID: ${tenant.id}`);
            console.log(`Name: ${tenant.name}`);
            console.log(`DB Name: ${tenant.db_name}`);
            console.log(`Plan: ${tenant.plan}`);
            console.log(`Company Token: ${tenant.company_token}`);
            console.log('------------------------------------------------');
        }

    } catch (error) {
        console.error('Error:', error);
    } finally {
        process.exit(0);
    }
}

inspectTenant();
