
import db from '../src/models/index.js';

const { Tenant } = db;

const getTokens = async () => {
    try {
        const tenants = await Tenant.findAll({
            where: {
                name: ['Standard Corp', 'Premium Corp']
            }
        });

        console.log('--- TEST TOKENS ---');
        tenants.forEach(t => {
            console.log(`${t.name}: ${t.company_token}`);
        });
        console.log('-------------------');

    } catch (error) {
        console.error('Error fetching tokens:', error);
    } finally {
        process.exit();
    }
};

getTokens();
