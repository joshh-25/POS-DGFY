'use strict';

// DGFY-2067. Employee Credit is already a supported POS tender for completed
// transactions, but the split-payment allocation ledger was missing it from its
// tenant ENUM. Append the value after cheque so existing MySQL ENUM ordinals are
// not reinterpreted.

const SAFE_IDENTIFIER_PATTERN = /^[A-Za-z0-9_-]+$/;
const CURRENT_ENUM_VALUES = "'cash','gcash','maya','card','bank_transfer','cheque','employee_credit'";
const PREVIOUS_ENUM_VALUES = "'cash','gcash','maya','card','bank_transfer','cheque'";

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

const modifyAllocationEnum = async (queryInterface, databaseName, enumValues) => {
    if (!(await tableExists(queryInterface, databaseName, 'pos_payment_allocations'))) return;
    await queryInterface.sequelize.query(`
        ALTER TABLE ${quoteIdentifier(databaseName)}.${quoteIdentifier('pos_payment_allocations')}
        MODIFY COLUMN ${quoteIdentifier('payment_method')} ENUM(${enumValues}) NOT NULL
    `);
};

module.exports = {
    async up(queryInterface) {
        const currentDatabaseName = await getCurrentDatabaseName(queryInterface);
        if (!currentDatabaseName) return;
        const tenantDatabaseNames = await getActiveTenantDatabaseNames(queryInterface, currentDatabaseName);
        for (const databaseName of [...new Set([currentDatabaseName, ...tenantDatabaseNames])]) {
            await modifyAllocationEnum(queryInterface, databaseName, CURRENT_ENUM_VALUES);
        }
    },

    async down(queryInterface) {
        const currentDatabaseName = await getCurrentDatabaseName(queryInterface);
        if (!currentDatabaseName) return;
        const tenantDatabaseNames = await getActiveTenantDatabaseNames(queryInterface, currentDatabaseName);
        for (const databaseName of [...new Set([currentDatabaseName, ...tenantDatabaseNames])]) {
            if (!(await tableExists(queryInterface, databaseName, 'pos_payment_allocations'))) continue;
            const [rows] = await queryInterface.sequelize.query(
                `SELECT COUNT(*) AS count FROM ${quoteIdentifier(databaseName)}.${quoteIdentifier('pos_payment_allocations')} WHERE ${quoteIdentifier('payment_method')} = 'employee_credit'`
            );
            if (Number(rows?.[0]?.count || 0) > 0) {
                throw new Error(`Cannot roll back Employee Credit tender while ${databaseName}.pos_payment_allocations contains employee_credit rows`);
            }
            await modifyAllocationEnum(queryInterface, databaseName, PREVIOUS_ENUM_VALUES);
        }
    }
};
