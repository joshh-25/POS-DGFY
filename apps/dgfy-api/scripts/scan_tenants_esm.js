import { Sequelize } from 'sequelize';

const scanAll = async () => {
    const landlord = new Sequelize('SKU', 'root', '', { host: 'localhost', dialect: 'mysql', logging: false });
    const tenants = await landlord.query('SELECT name, db_name FROM tenants', { type: Sequelize.QueryTypes.SELECT });
    await landlord.close();

    console.log(`Found ${tenants.length} tenants. Starting scan...\n`);

    for (const tenant of tenants) {
        if (!tenant.db_name) continue;

        const s = new Sequelize(tenant.db_name, 'root', '', { host: 'localhost', dialect: 'mysql', logging: false });
        try {
            await s.authenticate();

            // Check if tables exist first
            const [tables] = await s.query('SHOW TABLES');
            const tableNames = tables.map(t => Object.values(t)[0]);

            const counts = {
                items: tableNames.includes('items') ? (await s.query('SELECT COUNT(*) as c FROM items'))[0][0].c : 0,
                suppliers: tableNames.includes('suppliers') ? (await s.query('SELECT COUNT(*) as c FROM suppliers'))[0][0].c : 0,
                purchase_orders: tableNames.includes('purchase_orders') ? (await s.query('SELECT COUNT(*) as c FROM purchase_orders'))[0][0].c : 0,
                job_orders: tableNames.includes('job_orders') ? (await s.query('SELECT COUNT(*) as c FROM job_orders'))[0][0].c : 0,
                ai_conversations: tableNames.includes('ai_conversations') ? (await s.query('SELECT COUNT(*) as c FROM ai_conversations'))[0][0].c : 0
            };

            console.log(`Tenant: ${tenant.name} (${tenant.db_name})`);
            console.log(`  Items: ${counts.items}`);
            console.log(`  Suppliers: ${counts.suppliers}`);
            console.log(`  Purchase Orders: ${counts.purchase_orders}`);
            console.log(`  Job Orders: ${counts.job_orders}`);
            console.log(`  AI Conversations: ${counts.ai_conversations}`);

            if (counts.ai_conversations > 0) {
                const [recent] = await s.query('SELECT title, created_at FROM ai_conversations ORDER BY created_at DESC LIMIT 1');
                if (recent && recent.length > 0) {
                    console.log(`  Latest AI Chat: "${recent[0].title}" (${recent[0].created_at})`);
                }
            }
            console.log('-----------------------------------');

        } catch (e) {
            console.log(`Tenant: ${tenant.name} (${tenant.db_name}) - ERROR: ${e.message}`);
        } finally {
            await s.close();
        }
    }
};

scanAll();
