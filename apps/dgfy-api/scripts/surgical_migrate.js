import sequelize from '../src/config/database.js';

const queryInterface = sequelize.getQueryInterface();
const normalize = (value) => String(value || '').trim().toLowerCase();

const getDatabaseName = async () => {
    const [rows] = await sequelize.query('SELECT DATABASE() AS db_name');
    return rows?.[0]?.db_name || sequelize.config.database;
};

const databaseExists = async (databaseName) => {
    const [rows] = await sequelize.query(
        `SELECT SCHEMA_NAME
         FROM information_schema.SCHEMATA
         WHERE SCHEMA_NAME = ?
         LIMIT 1`,
        { replacements: [databaseName] }
    );
    return Array.isArray(rows) && rows.length > 0;
};

const listTables = async (sequelizeInstance, databaseName) => {
    const [rows] = await sequelizeInstance.query(
        `SELECT table_name
         FROM information_schema.tables
         WHERE table_schema = ?`,
        { replacements: [databaseName] }
    );
    return rows
        .map((row) => row.TABLE_NAME || row.table_name)
        .filter((name) => !!name && name !== 'SequelizeMeta');
};

const loadIndexRows = async (sequelizeInstance, tableName) => {
    const [rows] = await sequelizeInstance.query(`SHOW INDEX FROM \`${tableName}\``);
    return rows || [];
};

const buildIndexMap = (indexRows) => {
    const byName = new Map();
    indexRows.forEach((row) => {
        const indexName = row.Key_name;
        if (!indexName) return;
        if (!byName.has(indexName)) {
            byName.set(indexName, {
                name: indexName,
                nonUnique: Number(row.Non_unique),
                columns: []
            });
        }
        const meta = byName.get(indexName);
        const position = Number(row.Seq_in_index) - 1;
        meta.columns[position] = normalize(row.Column_name);
    });
    return byName;
};

const duplicateSignatures = (indexMap) => {
    const bySignature = new Map();
    for (const meta of indexMap.values()) {
        if (meta.name === 'PRIMARY') continue;
        const signature = meta.columns.join('|');
        if (!signature) continue;
        if (!bySignature.has(signature)) bySignature.set(signature, []);
        bySignature.get(signature).push(meta);
    }
    return [...bySignature.entries()].filter(([, metas]) => metas.length > 1);
};

const chooseKeeper = (metas) => {
    const ranked = [...metas].sort((a, b) => {
        if (a.nonUnique !== b.nonUnique) return a.nonUnique - b.nonUnique;
        return a.name.localeCompare(b.name);
    });
    return ranked[0];
};

const dropIndexSafe = async (queryInterfaceInstance, sequelizeInstance, tableName, indexName) => {
    try {
        await queryInterfaceInstance.removeIndex(tableName, indexName);
    } catch {
        await sequelizeInstance.query(`ALTER TABLE \`${tableName}\` DROP INDEX \`${indexName}\``);
    }
};

const pruneExactDuplicateIndexes = async (sequelizeInstance, queryInterfaceInstance, databaseName) => {
    const tables = await listTables(sequelizeInstance, databaseName);

    for (const tableName of tables) {
        const indexRows = await loadIndexRows(sequelizeInstance, tableName);
        const indexMap = buildIndexMap(indexRows);
        const duplicates = duplicateSignatures(indexMap);

        for (const [signature, metas] of duplicates) {
            const keeper = chooseKeeper(metas);
            const toDrop = metas.filter((meta) => meta.name !== keeper.name);
            if (toDrop.length === 0) continue;

            console.log(
                `[${databaseName}.${tableName}] duplicate signature [${signature}] -> keep ${keeper.name}; drop ${toDrop.map((m) => m.name).join(', ')}`
            );

            for (const meta of toDrop) {
                try {
                    await dropIndexSafe(queryInterfaceInstance, sequelizeInstance, tableName, meta.name);
                } catch (error) {
                    console.log(`   skipped ${meta.name}: ${error.message}`);
                }
            }
        }
    }
};

const ensureWebhookLogsSchema = async () => {
    console.log('\n--- Step 1: WebhookLogs Schema Verification ---');
    const tables = await queryInterface.showAllTables();
    if (tables.includes('webhook_logs')) {
        const tableDesc = await queryInterface.describeTable('webhook_logs');
        if (tableDesc.id && String(tableDesc.id.type).includes('INT')) {
            console.log('Detected legacy INTEGER id in webhook_logs; recreating with UUID id.');
            await queryInterface.dropTable('webhook_logs');
        }
    }

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
    console.log('webhook_logs verified.');
};

const runTenantColumnSanity = async () => {
    console.log('\n--- Step 4: Tenant Column Sanity Check ---');
    const tenantColumns = await queryInterface.describeTable('tenants');
    const requiredColumns = [
        {
            name: 'subscription_status',
            query: "ALTER TABLE tenants ADD COLUMN IF NOT EXISTS subscription_status ENUM('active', 'inactive', 'past_due', 'cancelled', 'pending') DEFAULT 'inactive'"
        },
        {
            name: 'grace_period_end',
            query: 'ALTER TABLE tenants ADD COLUMN IF NOT EXISTS grace_period_end DATETIME'
        },
        {
            name: 'cancelled_at',
            query: 'ALTER TABLE tenants ADD COLUMN IF NOT EXISTS cancelled_at DATETIME'
        }
    ];

    for (const required of requiredColumns) {
        if (tenantColumns[required.name]) continue;
        try {
            console.log(`adding missing column: ${required.name}`);
            await sequelize.query(required.query);
        } catch (error) {
            console.log(`   skipped ${required.name}: ${error.message}`);
        }
    }
};

async function migrate() {
    console.log('Starting Universal Surgical Migration...');

    try {
        await ensureWebhookLogsSchema();

        const mainDatabase = await getDatabaseName();
        console.log('\n--- Step 2: Pruning exact duplicate indexes (main database) ---');
        await pruneExactDuplicateIndexes(sequelize, queryInterface, mainDatabase);

        console.log('\n--- Step 3: Pruning exact duplicate indexes (tenant databases) ---');
        const [tenants] = await sequelize.query("SELECT db_name FROM tenants WHERE status = 'active'");
        for (const tenant of tenants) {
            const tenantDatabase = tenant.db_name;
            if (!tenantDatabase || tenantDatabase === mainDatabase) continue;

            const exists = await databaseExists(tenantDatabase);
            if (!exists) {
                console.log(`skip ${tenantDatabase}: database does not exist.`);
                continue;
            }

            const tenantSequelize = new sequelize.constructor(
                tenantDatabase,
                sequelize.config.username,
                sequelize.config.password,
                {
                    host: sequelize.config.host,
                    dialect: 'mysql',
                    logging: false
                }
            );

            try {
                const tenantQueryInterface = tenantSequelize.getQueryInterface();
                await pruneExactDuplicateIndexes(tenantSequelize, tenantQueryInterface, tenantDatabase);
            } catch (error) {
                console.log(`failed tenant cleanup for ${tenantDatabase}: ${error.message}`);
            } finally {
                await tenantSequelize.close();
            }
        }

        await runTenantColumnSanity();
        console.log('\nSurgical migration complete.');
    } catch (error) {
        console.error('\nSurgical migration failed:', error);
    } finally {
        await sequelize.close();
        process.exit();
    }
}

migrate();
