'use strict';

// Repair rows written before payment timing was enforced. Empty strings are possible in older
// MySQL ENUM/VARCHAR schemas and are not covered by the original NULL-only normalization.

const SAFE_IDENTIFIER_PATTERN = /^[A-Za-z0-9_-]+$/;

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

const getActiveTenantDatabaseNames = async (queryInterface, currentDatabaseName) => {
    if (!(await tableExists(queryInterface, currentDatabaseName, 'tenants'))) return [];
    const [rows] = await queryInterface.sequelize.query(
        "SELECT DISTINCT db_name FROM tenants WHERE status = 'active' AND db_name IS NOT NULL AND db_name <> ''"
    );
    return rows.map((row) => String(row?.db_name || '').trim()).filter(Boolean);
};

const columnExists = async (queryInterface, databaseName, tableName, columnName) => {
    const [rows] = await queryInterface.sequelize.query(
        `SELECT COUNT(*) AS count
           FROM information_schema.columns
          WHERE table_schema = ? AND table_name = ? AND column_name = ?`,
        { replacements: [databaseName, tableName, columnName] }
    );
    return Number(rows?.[0]?.count || 0) > 0;
};

const normalizeDatabase = async (queryInterface, databaseName) => {
    if (!(await tableExists(queryInterface, databaseName, 'pos_transactions'))) return;
    if (!(await columnExists(queryInterface, databaseName, 'pos_transactions', 'payment_timing'))) return;

    const table = `${quoteIdentifier(databaseName)}.${quoteIdentifier('pos_transactions')}`;
    await queryInterface.sequelize.query(
        `UPDATE ${table}
            SET ${quoteIdentifier('payment_timing')} = CASE
                WHEN ${quoteIdentifier('order_method')} = 'dine_in'
                    AND ${quoteIdentifier('payment_type')} = 'cash' THEN 'on_dine_in'
                WHEN ${quoteIdentifier('order_method')} = 'pickup'
                    AND ${quoteIdentifier('payment_type')} = 'cash' THEN 'on_pickup'
                WHEN ${quoteIdentifier('order_method')} = 'delivery'
                    AND ${quoteIdentifier('payment_type')} = 'cash' THEN 'on_delivery'
                ELSE 'upfront'
            END
          WHERE ${quoteIdentifier('payment_timing')} IS NULL
             OR TRIM(${quoteIdentifier('payment_timing')}) = ''`
    );
};

module.exports = {
    async up(queryInterface) {
        const currentDatabaseName = await getCurrentDatabaseName(queryInterface);
        if (!currentDatabaseName) return;

        const tenantDatabaseNames = await getActiveTenantDatabaseNames(queryInterface, currentDatabaseName);
        for (const databaseName of [...new Set([currentDatabaseName, ...tenantDatabaseNames])]) {
            await normalizeDatabase(queryInterface, databaseName);
        }
    },

    // This is a one-way data repair. Reverting repaired timing would recreate the invalid state
    // and cannot safely infer each row's previous value.
    async down() {}
};
