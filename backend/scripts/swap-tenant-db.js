import db from '../src/models/index.js';

const MODE = process.argv[2]; // 'standard' or 'premium'

async function swapDb() {
    try {
        const Tenant = db.Tenant;

        console.log(`Swapping DB for ${MODE}...`);

        // Reset both to dummy first to avoid collision
        await Tenant.update({ db_name: 'tenant_standard_dummy' }, { where: { name: 'Standard Corp' } });
        await Tenant.update({ db_name: 'tenant_premium_dummy' }, { where: { name: 'Premium Corp' } });

        if (MODE === 'standard') {
            await Tenant.update({ db_name: 'SKU' }, { where: { name: 'Standard Corp' } });
        } else if (MODE === 'premium') {
            await Tenant.update({ db_name: 'SKU' }, { where: { name: 'Premium Corp' } });
        }

        console.log('Swap complete.');

    } catch (error) {
        console.error('Error:', error);
    } finally {
        process.exit(0);
    }
}

swapDb();
