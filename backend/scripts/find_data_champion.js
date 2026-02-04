import { Sequelize } from 'sequelize';

const findChampion = async () => {
    const landlord = new Sequelize('SKU', 'root', '', { host: 'localhost', dialect: 'mysql', logging: false });
    const tenants = await landlord.query('SELECT name, db_name FROM tenants', { type: Sequelize.QueryTypes.SELECT });
    await landlord.close();

    let champion = null;
    let maxScore = -1;

    for (const tenant of tenants) {
        if (!tenant.db_name) continue;
        const s = new Sequelize(tenant.db_name, 'root', '', { host: 'localhost', dialect: 'mysql', logging: false });
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

            const score = counts.items + counts.suppliers + counts.po + counts.jo + (counts.ai * 10);
            if (score > maxScore) {
                maxScore = score;
                champion = { ...tenant, counts };
            }
        } catch (e) { } finally { await s.close(); }
    }

    if (champion) {
        console.log('ResultFound:');
        console.log(JSON.stringify(champion, null, 2));
    } else {
        console.log('No champion found.');
    }
};

findChampion();
