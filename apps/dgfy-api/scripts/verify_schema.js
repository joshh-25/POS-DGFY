import { Sequelize } from 'sequelize';
import dotenv from 'dotenv';
dotenv.config();

async function checkSchema() {
    const tenantDbName = 'sku_test_tenant_a';
    const tenantSeq = new Sequelize(tenantDbName, process.env.DB_USER || 'root', process.env.DB_PASSWORD || '', {
        host: process.env.DB_HOST || 'localhost',
        dialect: 'mysql',
        logging: false
    });

    try {
        const [results] = await tenantSeq.query("DESCRIBE items");
        console.log('Columns in items table:');
        results.forEach(col => {
            if (['nesting_level', 'max_child_depth', 'is_leaf_node', 'composition_hash'].includes(col.Field)) {
                console.log(`✅ ${col.Field}`);
            }
        });
    } catch (err) {
        console.error('Error:', err.message);
    } finally {
        await tenantSeq.close();
    }
}

checkSchema();
