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

        // 2. Universal Index Pruning (The "64 Keys" Fix)
        console.log('\n--- Step 2: Pruning Redundant Indexes Across All Tables ---');
        const dbName = sequelize.config.database;
        const [allTables] = await sequelize.query(`SELECT table_name FROM information_schema.tables WHERE table_schema = '${dbName}'`);

        for (const tableRow of allTables) {
            const tableName = tableRow.TABLE_NAME || tableRow.table_name;
            if (tableName === 'SequelizeMeta') continue;

            const [indexes] = await sequelize.query(`SHOW INDEX FROM \`${tableName}\``);
            const indexMap = {};

            for (const idx of indexes) {
                const col = idx.Column_name;
                if (!indexMap[col]) indexMap[col] = [];
                indexMap[col].push(idx.Key_name);
            }

            for (const col in indexMap) {
                const names = indexMap[col];
                if (names.length > 1) {
                    console.log(`⚠️  Table [${tableName}] Column [${col}] has ${names.length} indexes: ${names.join(', ')}`);

                    // Keep the first one, or the one that looks like a primary/unique constraint
                    // Drop others ending in _#, or just duplicates
                    for (let i = 1; i < names.length; i++) {
                        const idxName = names[i];
                        if (idxName === 'PRIMARY') continue;

                        console.log(`   🛠  Dropping redundant index from ${tableName}: ${idxName}...`);
                        await queryInterface.removeIndex(tableName, idxName).catch(e => {
                            // If index is part of a foreign key, we might need a raw query
                            return sequelize.query(`ALTER TABLE \`${tableName}\` DROP INDEX \`${idxName}\``);
                        }).catch(e => console.log(`   ⏭  Skipped ${idxName}: ${e.message}`));
                    }
                }
            }
        }

        // 3. Clean All Tenant Databases
        const [tenants] = await sequelize.query("SELECT db_name FROM tenants WHERE status = 'active'");
        for (const tenant of tenants) {
            const tDb = tenant.db_name;
            if (tDb === dbName) continue; // Already cleaned main

            console.log(`\n--- Cleaning Tenant Database Index Bloat: ${tDb} ---`);
            try {
                const tSeq = new sequelize.constructor(tDb, sequelize.config.username, sequelize.config.password, {
                    host: sequelize.config.host,
                    dialect: 'mysql',
                    logging: false
                });
                const tQI = tSeq.getQueryInterface();
                const [tTables] = await tSeq.query(`SELECT table_name FROM information_schema.tables WHERE table_schema = '${tDb}'`);

                for (const tRow of tTables) {
                    const tTable = tRow.TABLE_NAME || tRow.table_name;
                    if (tTable === 'SequelizeMeta') continue;

                    const [tIndexes] = await tSeq.query(`SHOW INDEX FROM \`${tTable}\``);
                    const tIdxMap = {};
                    for (const idx of tIndexes) {
                        const col = idx.Column_name;
                        if (!tIdxMap[col]) tIdxMap[col] = [];
                        tIdxMap[col].push(idx.Key_name);
                    }

                    for (const col in tIdxMap) {
                        const names = tIdxMap[col];
                        if (names.length > 1) {
                            console.log(`   ⚠️  Table [${tTable}] Column [${col}] has ${names.length} indexes.`);
                            for (let i = 1; i < names.length; i++) {
                                const idxName = names[i];
                                if (idxName === 'PRIMARY') continue;
                                console.log(`      🛠  Dropping: ${idxName}...`);
                                await tQI.removeIndex(tTable, idxName).catch(e => {
                                    return tSeq.query(`ALTER TABLE \`${tTable}\` DROP INDEX \`${idxName}\``);
                                }).catch(e => { });
                            }
                        }
                    }
                }
                await tSeq.close();
            } catch (tErr) {
                console.log(`   ❌ Failed to clean ${tDb}: ${tErr.message}`);
            }
        }

        console.log('\n--- Step 4: Column Sanity Check ---');
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
