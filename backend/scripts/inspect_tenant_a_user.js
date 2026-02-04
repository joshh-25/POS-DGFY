import { Sequelize } from 'sequelize';

const inspectTenantAUser = async () => {
    const dbName = 'sku_test_tenant_a';
    console.log(`Connecting to tenant DB: ${dbName}`);

    const tenantSeq = new Sequelize(dbName, process.env.DB_USER || 'root', process.env.DB_PASSWORD || '', {
        host: process.env.DB_HOST || 'localhost',
        dialect: 'mysql',
        logging: false
    });

    try {
        await tenantSeq.authenticate();

        // Check Columns
        const columns = await tenantSeq.query("DESCRIBE users", { type: tenantSeq.QueryTypes.SELECT });
        console.log('✅ Users Table Structure:', JSON.stringify(columns, null, 2));

        // Check Users
        const users = await tenantSeq.query("SELECT * FROM users", { type: tenantSeq.QueryTypes.SELECT });
        console.log('✅ Users Data:', JSON.stringify(users, null, 2));

    } catch (error) {
        console.error('❌ Error:', error);
    } finally {
        await tenantSeq.close();
    }
};

inspectTenantAUser();
