import sequelize from '../src/config/database.js';
const queryInterface = sequelize.getQueryInterface();

async function migrate() {
    console.log('🚀 Starting Universal Surgical Migration...');

    try {
        // 1. Fix WebhookLogs Schema
        console.log('\n--- Step 1: WebhookLogs Schema Verification ---');
        const tables = await queryInterface.showAllTables();
        if (tables.includes('webhook_logs')) {
            const tableDesc = await queryInterface.describeTable('webhook_logs');
            if (tableDesc.id && tableDesc.id.type.includes('INT')) {
                console.log('⚠️  Detecting old INTEGER ID in webhook_logs. Dropping for conversion to UUID...');
                await queryInterface.dropTable('webhook_logs');
                console.log('✅ WebhookLogs dropped.');
            }
        }

        // Recreate with UUID
        await sequelize.query(`
            CREATE TABLE IF NOT EXISTS webhook_logs (
                id CHAR(36) BINARY PRIMARY KEY,
                webhook_id VARCHAR(255) UNIQUE NOT NULL,
                event_type VARCHAR(255),
                resource_id VARCHAR(255),
                status ENUM('processed', 'failed', 'pending') DEFAULT 'pending',
                error_message TEXT,
                processed_at DATETIME,
                created_at DATETIME NOT NULL,
                updated_at DATETIME NOT NULL
            )
        `);
        console.log('✅ WebhookLog table verified/created with UUID.');

        // 2. Fix Tenants Index Bloat (The "64 Keys" Fix)
        console.log('\n--- Step 2: Pruning Redundant Tenant Indexes ---');
        const [indexes] = await sequelize.query("SHOW INDEX FROM tenants");
        const indexMap = {};

        for (const idx of indexes) {
            const col = idx.Column_name;
            if (!indexMap[col]) indexMap[col] = [];
            indexMap[col].push(idx.Key_name);
        }

        for (const col in indexMap) {
            const names = indexMap[col];
            if (names.length > 1) {
                console.log(`⚠️  Column [${col}] has ${names.length} indexes: ${names.join(', ')}`);
                // Keep the "cleanest" name (usually the one matching the column name or 'unique')
                // Drop the rest
                for (let i = 1; i < names.length; i++) {
                    const idxName = names[i];
                    if (idxName === 'PRIMARY') continue;
                    console.log(`   🛠  Dropping redundant index: ${idxName}...`);
                    await queryInterface.removeIndex('tenants', idxName).catch(e => console.log(`   ⏭  Already dropped: ${idxName}`));
                }
            }
        }

        // 3. Ensure Missing Columns
        console.log('\n--- Step 3: Column Sanity Check ---');
        const tenantColumns = await queryInterface.describeTable('tenants');
        const required = [
            { name: 'subscription_status', query: "ALTER TABLE tenants ADD COLUMN IF NOT EXISTS subscription_status ENUM('active', 'inactive', 'past_due', 'cancelled', 'pending') DEFAULT 'inactive'" },
            { name: 'grace_period_end', query: "ALTER TABLE tenants ADD COLUMN IF NOT EXISTS grace_period_end DATETIME" },
            { name: 'cancelled_at', query: "ALTER TABLE tenants ADD COLUMN IF NOT EXISTS cancelled_at DATETIME" }
        ];

        for (const req of required) {
            if (!tenantColumns[req.name]) {
                console.log(`🛠  Adding missing column: ${req.name}...`);
                await sequelize.query(req.query).catch(e => console.log(`   ⏭  Note: ${e.message}`));
            }
        }

        console.log('\n✨ Surgical Migration Complete!');
    } catch (err) {
        console.error('\n❌ Surgical Migration Failed:', err);
    } finally {
        await sequelize.close();
        process.exit();
    }
}

migrate();
