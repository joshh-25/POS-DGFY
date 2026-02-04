import { Sequelize } from 'sequelize';

const checkLegacy = async () => {
    const dbs = ['sku_inventory_manager', 'sku', 'sku_test_tenant_a'];

    for (const dbName of dbs) {
        const s = new Sequelize(dbName, 'root', '', { host: 'localhost', dialect: 'mysql', logging: false });
        try {
            await s.authenticate();
            const [tables] = await s.query('SHOW TABLES');
            const tableNames = tables.map(t => Object.values(t)[0]);

            const counts = {
                items: tableNames.includes('items') ? (await s.query('SELECT COUNT(*) as c FROM items'))[0][0].c : 0,
                suppliers: tableNames.includes('suppliers') ? (await s.query('SELECT COUNT(*) as c FROM suppliers'))[0][0].c : 0,
                po: tableNames.includes('purchase_orders') ? (await s.query('SELECT COUNT(*) as c FROM purchase_orders'))[0][0].c : 0,
                jo: tableNames.includes('job_orders') ? (await s.query('SELECT COUNT(*) as c FROM job_orders'))[0][0].c : 0,
                ai: tableNames.includes('ai_conversations') ? (await s.query('SELECT COUNT(*) as c FROM ai_conversations'))[0][0].c : 0
            };

            console.log(`Database: ${dbName}`);
            console.log(`  Items: ${counts.items}, Suppliers: ${counts.suppliers}, PO: ${counts.po}, JO: ${counts.jo}, AI: ${counts.ai}`);

            if (counts.ai > 0) {
                const [recent] = await s.query('SELECT title, created_at FROM ai_conversations ORDER BY created_at DESC LIMIT 1');
                console.log(`  Latest AI Chat: "${recent[0].title}" (${recent[0].created_at})`);
            }
            console.log('-----------------------------------');
        } catch (e) {
            console.log(`Database: ${dbName} - ERROR: ${e.message}`);
        } finally {
            await s.close();
        }
    }
};

checkLegacy();
