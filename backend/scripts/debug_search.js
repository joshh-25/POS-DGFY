
import { Op } from 'sequelize';
import db from '../src/models/index.js';
import { getItems } from '../src/services/itemService.js';

async function run() {
    console.log('Starting Smart Search Verification...');

    try {
        await db.sequelize.authenticate();
        console.log('DB Connected and Associations Loaded.');

        const cases = [
            { query: 'pre cut', expectedMin: 1, desc: 'Flexible Separator: "pre cut" -> "Pre-cut"' },
            { query: 'wrap shrinkable', expectedMin: 1, desc: 'Keyword Order: "wrap shrinkable" -> "Shrinkable Wrap"' },
            { query: 'shrinkable wrap', expectedMin: 1, desc: 'Standard Order: "shrinkable wrap" -> "Shrinkable Wrap"' }
        ];

        let allPass = true;

        for (const c of cases) {
            console.log(`\n--- Testing Query: "${c.query}" ---`);
            const result = await getItems({ search: c.query, limit: 5 });
            console.log(`Found ${result.items.length} items.`);
            result.items.forEach(i => console.log(` - ${i.name} (${i.sku_code})`));

            if (result.items.length >= c.expectedMin) {
                console.log(`✅ PASS: ${c.desc}`);
            } else {
                console.log(`❌ FAIL: ${c.desc}`);
                allPass = false;
            }
        }

        if (allPass) {
            console.log('\n✅ ALL TESTS PASSED');
        } else {
            console.log('\n❌ SOME TESTS FAILED');
        }

    } catch (error) {
        console.error('Test failed:', error);
    } finally {
        await db.sequelize.close();
    }
}

run();
