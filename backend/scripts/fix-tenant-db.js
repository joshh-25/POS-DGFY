import db from '../src/models/index.js';
import { Op } from 'sequelize';

async function fixTenantDb() {
    try {
        console.log('Connecting to Landlord DB...');
        const Tenant = db.Tenant;

        console.log('Updating Test Tenants to use DB: SKU');
        const [updatedCount] = await Tenant.update({ db_name: 'SKU' }, {
            where: {
                name: { [Op.in]: ['Standard Corp', 'Premium Corp'] }
            }
        });

        console.log(`Updated ${updatedCount} tenants.`);

    } catch (error) {
        console.error('Error:', error);
    } finally {
        process.exit(0);
    }
}

fixTenantDb();
