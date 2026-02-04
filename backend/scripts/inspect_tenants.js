import sequelize from '../src/config/database.js';

const inspectTenants = async () => {
    try {
        await sequelize.authenticate();
        console.log('Connected to Landlord DB.');

        const tenants = await sequelize.query(`
            SELECT * FROM tenants 
            WHERE company_token = 'token-tenant-a' 
            OR name LIKE '%Tenant A%'
        `, {
            type: sequelize.QueryTypes.SELECT
        });

        console.log('✅ Found Tenants:', JSON.stringify(tenants, null, 2));

    } catch (error) {
        console.error('❌ Error:', error);
    } finally {
        await sequelize.close();
    }
};

inspectTenants();
