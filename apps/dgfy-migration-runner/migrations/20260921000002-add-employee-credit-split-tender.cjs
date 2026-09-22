'use strict';

// Phase 444. Employee Credit is a valid split tender. Append the ENUM value after cheque so
// MySQL's existing ENUM ordinals remain stable, and persist the verified account code needed by
// final split-payment completion. The account code is an internal completion key and is removed
// from public allocation responses by splitPaymentUseCases.js.

const SAFE_IDENTIFIER_PATTERN = /^[A-Za-z0-9_-]+$/;
const PAYMENT_METHOD_ENUM = "'cash','gcash','maya','card','bank_transfer','cheque','employee_credit'";
const PREVIOUS_PAYMENT_METHOD_ENUM = "'cash','gcash','maya','card','bank_transfer','cheque'";

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
    if (!currentDatabaseName || !(await tableExists(queryInterface, currentDatabaseName, 'tenants'))) return [];
    const [rows] = await queryInterface.sequelize.query(
        "SELECT DISTINCT db_name FROM tenants WHERE status = 'active' AND db_name IS NOT NULL AND db_name <> ''"
    );
    return rows.map((row) => String(row?.db_name || '').trim()).filter(Boolean);
};

const widenPaymentMethod = async (queryInterface, databaseName) => {
    if (!(await tableExists(queryInterface, databaseName, 'pos_payment_allocations'))) return;
    if (await columnExists(queryInterface, databaseName, 'pos_payment_allocations', 'payment_method')) {
        await queryInterface.sequelize.query(`
            ALTER TABLE ${quoteIdentifier(databaseName)}.\`pos_payment_allocations\`
            MODIFY COLUMN \`payment_method\` ENUM(${PAYMENT_METHOD_ENUM}) NOT NULL
        `);
    }
    if (!(await columnExists(queryInterface, databaseName, 'pos_payment_allocations', 'employee_credit_account_code'))) {
        await queryInterface.sequelize.query(`
            ALTER TABLE ${quoteIdentifier(databaseName)}.\`pos_payment_allocations\`
            ADD COLUMN \`employee_credit_account_code\` VARCHAR(40) NULL AFTER \`payment_method\`
        `);
    }
};

const narrowPaymentMethod = async (queryInterface, databaseName) => {
    if (!(await tableExists(queryInterface, databaseName, 'pos_payment_allocations'))) return;
    const hasPaymentMethod = await columnExists(queryInterface, databaseName, 'pos_payment_allocations', 'payment_method');
    const hasAccountCode = await columnExists(queryInterface, databaseName, 'pos_payment_allocations', 'employee_credit_account_code');
    if (!hasPaymentMethod && !hasAccountCode) return;

    if (hasPaymentMethod) {
        const [rows] = await queryInterface.sequelize.query(`
            SELECT COUNT(*) AS count
            FROM ${quoteIdentifier(databaseName)}.\`pos_payment_allocations\`
            WHERE \`payment_method\` = 'employee_credit'
        `);
        if (Number(rows?.[0]?.count || 0) > 0) {
            throw new Error(`Cannot roll back Employee Credit split tender while ${databaseName}.pos_payment_allocations contains Employee Credit rows`);
        }
    }
    if (hasAccountCode) {
        const [rows] = await queryInterface.sequelize.query(`
            SELECT COUNT(*) AS count
            FROM ${quoteIdentifier(databaseName)}.\`pos_payment_allocations\`
            WHERE \`employee_credit_account_code\` IS NOT NULL
        `);
        if (Number(rows?.[0]?.count || 0) > 0) {
            throw new Error(`Cannot roll back Employee Credit split tender while ${databaseName}.pos_payment_allocations contains account data`);
        }
    }

    if (hasPaymentMethod) {
        await queryInterface.sequelize.query(`
            ALTER TABLE ${quoteIdentifier(databaseName)}.\`pos_payment_allocations\`
            MODIFY COLUMN \`payment_method\` ENUM(${PREVIOUS_PAYMENT_METHOD_ENUM}) NOT NULL
        `);
    }
    if (hasAccountCode) {
        await queryInterface.sequelize.query(`
            ALTER TABLE ${quoteIdentifier(databaseName)}.\`pos_payment_allocations\`
            DROP COLUMN \`employee_credit_account_code\`
        `);
    }
};

module.exports = {
    async up(queryInterface) {
        const currentDatabaseName = await getCurrentDatabaseName(queryInterface);
        if (!currentDatabaseName) return;
        const tenantDatabaseNames = await getActiveTenantDatabaseNames(queryInterface, currentDatabaseName);
        for (const databaseName of [...new Set([currentDatabaseName, ...tenantDatabaseNames])]) {
            await widenPaymentMethod(queryInterface, databaseName);
        }
    },

    async down(queryInterface) {
        const currentDatabaseName = await getCurrentDatabaseName(queryInterface);
        if (!currentDatabaseName) return;
        const tenantDatabaseNames = await getActiveTenantDatabaseNames(queryInterface, currentDatabaseName);
        for (const databaseName of [...new Set([currentDatabaseName, ...tenantDatabaseNames])]) {
            await narrowPaymentMethod(queryInterface, databaseName);
        }
    }
};
