
import { exportSuppliers } from '../src/services/supplierCSVService.js';
import sequelize from '../src/config/database.js';

async function test() {
    try {
        await sequelize.authenticate();
        console.log('Database connected.');

        // Test 1: Export All
        console.log('--- Test 1: Export ALL ---');
        const resAll = await exportSuppliers({});
        console.log('Count All:', resAll.count);

        // Test 2: Export Specific IDs (Assuming IDs 1 and 2 exist, if not, we might get 0, which is also a valid test of filtering)
        // Let's first fetch some IDs to be sure.
        const [results] = await sequelize.query("SELECT supplier_id FROM suppliers LIMIT 2");
        const ids = results.map(r => String(r.supplier_id)); // Service expects strings if coming from controller, or array of whatever.

        if (ids.length === 0) {
            console.log('No suppliers in DB to test with.');
            process.exit(0);
        }

        console.log('--- Test 2: Export IDs:', ids, ' ---');
        const resFiltered = await exportSuppliers({ ids: ids });
        console.log('Count Filtered:', resFiltered.count);

        if (resFiltered.count === ids.length) {
            console.log('SUCCESS: Filtered count matches requested IDs.');
        } else {
            console.log('FAILURE: Filtered count mismatch.');
        }

    } catch (error) {
        console.error('Error:', error);
    } finally {
        await sequelize.close();
    }
}

test();
