'use strict';

// Seed the tenant-scoped EAV setting without changing any existing taxpayer
// classification. The API resolves legacy aliases at runtime and owns future
// write validation; this migration only guarantees that the setting exists.
const SAFE_IDENTIFIER_PATTERN = /^[A-Za-z0-9_-]+$/;
const SYSTEM_SETTINGS_TABLE = 'system_settings';
const SETTING_KEY = 'pos_taxpayer_type';
const SETTING_VALUE = '';
const SETTING_DATA_TYPE = 'string';
const SETTING_DESCRIPTION = 'POS taxpayer classification used for fiscal document setup; choose VAT or non-VAT only after review.';

const quoteIdentifier = (identifier) => {
    const normalized = String(identifier || '').trim();
    if (!SAFE_IDENTIFIER_PATTERN.test(normalized)) {
        throw new Error(`Unsafe database identifier: ${identifier}`);
    }
    return `\`${normalized}\``;
};

const getCurrentDatabaseName = async (queryInterface) => {
    const [rows] = await queryInterface.sequelize.query('SELECT DATABASE() AS dbName');
    return rows?.[0]?.dbName || rows?.[0]?.db_name || null;
};

const tableExists = async (queryInterface, databaseName, tableName) => {
    const [rows] = await queryInterface.sequelize.query(
        'SELECT COUNT(*) AS count FROM information_schema.tables WHERE table_schema = ? AND table_name = ?',
        { replacements: [databaseName, tableName] }
    );
    return Number(rows?.[0]?.count || 0) > 0;
};

const getActiveTenantDatabaseNames = async (queryInterface, currentDatabaseName) => {
    if (!(await tableExists(queryInterface, currentDatabaseName, 'tenants'))) return [];
    const [rows] = await queryInterface.sequelize.query(
        "SELECT DISTINCT db_name FROM tenants WHERE status = 'active' AND db_name IS NOT NULL AND db_name <> ''"
    );
    return (rows || [])
        .map((row) => String(row?.db_name || '').trim())
        .filter(Boolean);
};

const getTargetDatabaseNames = async (queryInterface) => {
    const currentDatabaseName = await getCurrentDatabaseName(queryInterface);
    if (!currentDatabaseName) return [];

    const tenantDatabaseNames = await getActiveTenantDatabaseNames(queryInterface, currentDatabaseName);
    return [...new Set([currentDatabaseName, ...tenantDatabaseNames])];
};

const seedSettingIfMissing = async (queryInterface, databaseName) => {
    const table = `${quoteIdentifier(databaseName)}.${quoteIdentifier(SYSTEM_SETTINGS_TABLE)}`;
    const [rows] = await queryInterface.sequelize.query(
        `SELECT setting_key FROM ${table} WHERE setting_key = ? LIMIT 1`,
        { replacements: [SETTING_KEY] }
    );
    if (Array.isArray(rows) && rows.length > 0) return;

    await queryInterface.sequelize.query(
        `INSERT INTO ${table} (setting_key, setting_value, data_type, description, updated_at)
         VALUES (?, ?, ?, ?, NOW())`,
        {
            replacements: [
                SETTING_KEY,
                SETTING_VALUE,
                SETTING_DATA_TYPE,
                SETTING_DESCRIPTION
            ]
        }
    );
};

module.exports = {
    async up(queryInterface) {
        for (const databaseName of await getTargetDatabaseNames(queryInterface)) {
            if (!(await tableExists(queryInterface, databaseName, SYSTEM_SETTINGS_TABLE))) continue;
            await seedSettingIfMissing(queryInterface, databaseName);
        }
    },

    async down() {
        // Intentionally data-preserving. Once a tenant has selected or reviewed
        // a taxpayer classification, rolling back code must not delete it.
    }
};
