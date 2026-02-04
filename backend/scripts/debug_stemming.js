
import { Op } from 'sequelize';
import db from '../src/models/index.js';
import { getItems } from '../src/services/itemService.js';

async function run() {
    console.log('Starting Stemming Verification...');

    try {
        await db.sequelize.authenticate();
        console.log('DB Connected.');

        // 1. Check what actually exists
        const herbalItems = await db.Item.findAll({
            where: { name: { [Op.like]: '%Herb%' } }
        });
        console.log(`\nExisting Items matching '%Herb%': ${herbalItems.length}`);
        herbalItems.forEach(i => console.log(` - ${i.name} (${i.sku_code})`));

        // 2. Test "herbs" search (Current Logic)
        console.log('\nTesting Query: "herbs"');
        const result = await getItems({ search: 'herbs', limit: 5 });
        console.log(`Found ${result.items.length} items.`);
        result.items.forEach(i => console.log(` - ${i.name}`));

        if (result.items.length === 0 && herbalItems.length > 0) {
            console.log('❌ FAIL: "herbs" did not find Herbal items.');
        } else if (result.items.length > 0) {
            console.log('✅ PASS: "herbs" found items.');
        }

    } catch (error) {
        console.error('Test failed:', error);
    } finally {
        await db.sequelize.close();
    }
}

run();
