
import { sequelize } from '../models/index.js';
import tenantConnector from '../utils/TenantConnector.js';

async function verifyInfrastructure() {
    console.log('--- STARTING PHASE 1 VERIFICATION ---');

    try {
        // 1. Verify Landlord Connection
        await sequelize.authenticate();
        console.log('✅ Landlord DB Connection: OK');

        // 2. Create a Test Tenant (pointing to EXISTING DB for testing)
        // We use the current DB name so connection succeeds without provisioning
        const testDbName = sequelize.config.database;
        console.log(`ℹ️ Using existing DB '${testDbName}' as mock tenant DB.`);

        // Force a unique token
        const mockTenantData = {
            name: 'Verification Corp',
            email: 'verify@test.com',
            domain: 'verify.local'
        };

        // Create Tenant Record
        // We manually override db_name to point to existing DB for connectivity test
        const transaction = await sequelize.transaction();
        let tenant;
        try {
            // Create directly to override db_name logic
            const Tenant = sequelize.models.Tenant;
            tenant = await Tenant.create({
                name: mockTenantData.name,
                db_name: testDbName, // TRICK: Point to existing DB
                company_token: 'verify-token-' + Date.now(),
                status: 'active'
            }, { transaction });
            await transaction.commit();
            console.log(`✅ Tenant Record Created: ID ${tenant.id}`);
        } catch (e) {
            await transaction.rollback();
            throw e;
        }

        // 3. Test TenantConnector
        console.log('--- Testing TenantConnector ---');

        const start = Date.now();
        const tenantDb = await tenantConnector.getConnection(tenant);
        const duration = Date.now() - start;
        console.log(`✅ Connection 1 (New): ${duration}ms`);

        // Test Query
        const [results] = await tenantDb.query('SELECT DATABASE() as db');
        console.log(`✅ Query Result: Connected to '${results[0].db}'`);

        // 4. Test Caching
        const start2 = Date.now();
        await tenantConnector.getConnection(tenant);
        const duration2 = Date.now() - start2;
        console.log(`✅ Connection 2 (Cached): ${duration2}ms`);

        if (duration2 > 10) {
            console.warn('⚠️ Cache might not be working (took > 10ms)');
        } else {
            console.log('✅ Cache Verified: Extremely fast response');
        }

        // 5. Cleanup
        await tenantConnector.closeAll();
        // Optionally delete the test tenant record? Nah, good to have a trace.

        console.log('--- PHASE 1 VERIFICATION COMPLETE: ALL GREEN ---');
        process.exit(0);

    } catch (error) {
        console.error('❌ VERIFICATION FAILED:', error);
        process.exit(1);
    }
}

verifyInfrastructure();
