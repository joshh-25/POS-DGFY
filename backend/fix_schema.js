
import { sequelize } from './src/models/index.js';

async function fixSchema() {
    const queryInterface = sequelize.getQueryInterface();
    const tableName = 'items';

    try {
        console.log('Checking schema...');
        const [columns] = await sequelize.query(`SHOW COLUMNS FROM ${tableName}`);
        const existingColumns = columns.map(c => c.Field);

        const missingColumns = [
            { name: 'nesting_level', type: 'INT DEFAULT 0' },
            { name: 'max_child_depth', type: 'INT DEFAULT 0' },
            { name: 'is_leaf_node', type: 'TINYINT(1) DEFAULT 1' },
            { name: 'composition_hash', type: 'VARCHAR(64) NULL' }
        ];

        for (const col of missingColumns) {
            if (!existingColumns.includes(col.name)) {
                console.log(`Adding missing column: ${col.name}`);
                await sequelize.query(`ALTER TABLE ${tableName} ADD COLUMN ${col.name} ${col.type}`);
                console.log(`Added ${col.name}`);
            } else {
                console.log(`Column ${col.name} already exists.`);
            }
        }

        console.log('Schema fix completed.');

    } catch (error) {
        console.error('Schema fix failed:', error);
    } finally {
        await sequelize.close();
    }
}

fixSchema();
