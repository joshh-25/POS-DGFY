'use strict';

// `pos_transactions` is tenant-scoped. The migration runner connects to the landlord database,
// so this migration discovers active tenant databases and applies the same additive change to each
// schema. The API-side tenant-schema repair registry is kept in lockstep for tenants that miss the
// migration or are restored from an older snapshot.

const SAFE_IDENTIFIER_PATTERN = /^[A-Za-z0-9_-]+$/;
const POS_TRANSACTIONS_TABLE = 'pos_transactions';
const DELIVERY_PROVIDER_COLUMN = {
    name: 'delivery_provider_breakdown',
    ddl: "JSON NULL COMMENT 'Immutable delivery provider classification snapshot for completed POS sales'"
};

const quoteIdentifier = (identifier) => {
    const normalized = String(identifier || '').trim();
    if (!SAFE_IDENTIFIER_PATTERN.test(normalized)) {
        throw new Error(`Unsafe database identifier: ${identifier}`);
    }
    return `\`${normalized}\``;
};

const getCurrentDatabaseName = async (queryInterface) => {
    const [rows] = await queryInterface.sequelize.query('SELECT DATABASE() AS dbName');
    return rows?.[0]?.dbName || null;
};

const tableExists = async (queryInterface, databaseName, tableName) => {
    const [rows] = await queryInterface.sequelize.query(
        'SELECT COUNT(*) AS count FROM information_schema.tables WHERE table_schema = ? AND table_name = ?',
        { replacements: [databaseName, tableName] }
    );
    return Number(rows?.[0]?.count || 0) > 0;
};

const columnExists = async (queryInterface, databaseName, tableName, columnName) => {
    const [rows] = await queryInterface.sequelize.query(
        'SELECT COUNT(*) AS count FROM information_schema.columns WHERE table_schema = ? AND table_name = ? AND column_name = ?',
        { replacements: [databaseName, tableName, columnName] }
    );
    return Number(rows?.[0]?.count || 0) > 0;
};

const getActiveTenantDatabaseNames = async (queryInterface, currentDatabaseName) => {
    if (!(await tableExists(queryInterface, currentDatabaseName, 'tenants'))) return [];

    const [rows] = await queryInterface.sequelize.query(
        "SELECT DISTINCT db_name FROM tenants WHERE status = 'active' AND db_name IS NOT NULL AND db_name <> ''"
    );
    return rows.map((row) => String(row?.db_name || '').trim()).filter(Boolean);
};

const getTargetDatabaseNames = async (queryInterface) => {
    const currentDatabaseName = await getCurrentDatabaseName(queryInterface);
    if (!currentDatabaseName) return [];

    const tenantDatabaseNames = await getActiveTenantDatabaseNames(queryInterface, currentDatabaseName);
    return [...new Set([currentDatabaseName, ...tenantDatabaseNames])];
};

const addColumnIfMissing = async (queryInterface, databaseName) => {
    if (!(await tableExists(queryInterface, databaseName, POS_TRANSACTIONS_TABLE))) return;
    if (await columnExists(queryInterface, databaseName, POS_TRANSACTIONS_TABLE, DELIVERY_PROVIDER_COLUMN.name)) return;

    await queryInterface.sequelize.query(`
        ALTER TABLE ${quoteIdentifier(databaseName)}.${quoteIdentifier(POS_TRANSACTIONS_TABLE)}
        ADD COLUMN ${quoteIdentifier(DELIVERY_PROVIDER_COLUMN.name)} ${DELIVERY_PROVIDER_COLUMN.ddl}
    `);
};

const dropColumnIfPresent = async (queryInterface, databaseName) => {
    if (!(await tableExists(queryInterface, databaseName, POS_TRANSACTIONS_TABLE))) return;
    if (!(await columnExists(queryInterface, databaseName, POS_TRANSACTIONS_TABLE, DELIVERY_PROVIDER_COLUMN.name))) return;

    await queryInterface.sequelize.query(`
        ALTER TABLE ${quoteIdentifier(databaseName)}.${quoteIdentifier(POS_TRANSACTIONS_TABLE)}
        DROP COLUMN ${quoteIdentifier(DELIVERY_PROVIDER_COLUMN.name)}
    `);
};

module.exports = {
    async up(queryInterface) {
        const databaseNames = await getTargetDatabaseNames(queryInterface);
        for (const databaseName of databaseNames) {
            await addColumnIfMissing(queryInterface, databaseName);
        }
    },

    async down(queryInterface) {
        const databaseNames = await getTargetDatabaseNames(queryInterface);
        for (const databaseName of databaseNames) {
            await dropColumnIfPresent(queryInterface, databaseName);
        }
    }
};
