
import mysql from 'mysql2/promise';

(async () => {
    const conn = await mysql.createConnection({
        host: 'localhost',
        user: 'root',
        password: ''
    });

    try {
        const [dbs] = await conn.query("SHOW DATABASES LIKE 'sku_%'");
        const targetEmail = 'admin@test.com';
        console.log(`Searching for ${targetEmail} in ${dbs.length} databases...`);

        for (const dbRecord of dbs) {
            const dbName = Object.values(dbRecord)[0];

            try {
                // Check if users table exists
                const [tables] = await conn.query(`SHOW TABLES FROM \`${dbName}\` LIKE 'users'`);
                if (tables.length === 0) continue;

                // Check for user
                const [users] = await conn.query(`SELECT * FROM \`${dbName}\`.users WHERE email = ?`, [targetEmail]);

                if (users.length > 0) {
                    console.log(`\n🎉 FOUND USER in Database: ${dbName}`);
                    console.log(`User ID: ${users[0].id}, Role: ${users[0].role}`);

                    // Now find the Tenant record for this DB
                    try {
                        const [tenants] = await conn.query(`SELECT * FROM sku_inventory_manager.tenants WHERE db_name = ?`, [dbName]);
                        if (tenants.length > 0) {
                            console.log('✅ Corresponds to Tenant Record:');
                            console.log(`   ID: ${tenants[0].id}`);
                            console.log(`   Name: ${tenants[0].name}`);
                            console.log(`   Plan: ${tenants[0].plan}`);
                            console.log(`   Status: ${tenants[0].status}`);
                        } else {
                            console.log('⚠️  No corresponding Tenant record found in Landlord DB (Orphaned DB?)');
                        }
                    } catch (e) {
                        console.log('⚠️  Could not query Landlord DB for tenant info.');
                    }
                }
            } catch (err) {
                // Ignore errors
            }
        }
    } catch (e) {
        console.error(e);
    } finally {
        await conn.end();
    }
})();
