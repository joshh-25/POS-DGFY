'use strict';

// The original Dine-in payment-timing migration updated the landlord schema. Tenant databases
// already had the column from the earlier payment-timing rollout, so they need an explicit ENUM
// widening as well. This migration is intentionally idempotent and fans out across the landlord
// plus every active tenant database.

const SAFE_IDENTIFIER_PATTERN = /^[A-Za-z0-9_-]+$/;
const CURRENT_ENUM_VALUES = "'upfront','on_pickup','on_delivery','on_dine_in'";
const PREVIOUS_ENUM_VALUES = "'upfront','on_pickup','on_delivery'";

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

const getPaymentTimingColumn = async (queryInterface, databaseName) => {
    const [rows] = await queryInterface.sequelize.query(
        `SELECT COLUMN_TYPE, IS_NULLABLE, COLUMN_DEFAULT
           FROM information_schema.columns
          WHERE table_schema = ?
            AND table_name = 'pos_transactions'
            AND column_name = 'payment_timing'`,
        { replacements: [databaseName] }
    );
    return rows?.[0] || null;
};

const tableReference = (databaseName) => (
    `${quoteIdentifier(databaseName)}.${quoteIdentifier('pos_transactions')}`
);

const widenPaymentTiming = async (queryInterface, databaseName) => {
    if (!(await tableExists(queryInterface, databaseName, 'pos_transactions'))) return;

    const column = await getPaymentTimingColumn(queryInterface, databaseName);
    const table = tableReference(databaseName);

    if (!column) {
        await queryInterface.sequelize.query(
            `ALTER TABLE ${table}
             ADD COLUMN ${quoteIdentifier('payment_timing')} ENUM(${CURRENT_ENUM_VALUES})
             NOT NULL DEFAULT 'upfront' AFTER ${quoteIdentifier('payment_type')}`
        );
        return;
    }

    const columnType = String(column.COLUMN_TYPE || column.column_type || '').toLowerCase();
    const isAlreadyCanonical = columnType.includes("'on_dine_in'")
        && String(column.IS_NULLABLE || column.is_nullable || '').toUpperCase() === 'NO'
        && String(column.COLUMN_DEFAULT ?? column.column_default ?? '').replace(/^['"]|['"]$/g, '') === 'upfront';
    if (isAlreadyCanonical) return;

    await queryInterface.sequelize.query(
        `UPDATE ${table}
            SET ${quoteIdentifier('payment_timing')} = 'upfront'
          WHERE ${quoteIdentifier('payment_timing')} IS NULL`
    );
    await queryInterface.sequelize.query(
        `ALTER TABLE ${table}
         MODIFY COLUMN ${quoteIdentifier('payment_timing')} ENUM(${CURRENT_ENUM_VALUES})
         NOT NULL DEFAULT 'upfront'`
    );
};

const narrowPaymentTiming = async (queryInterface, databaseName) => {
    if (!(await tableExists(queryInterface, databaseName, 'pos_transactions'))) return;

    const column = await getPaymentTimingColumn(queryInterface, databaseName);
    if (!column) return;

    const [rows] = await queryInterface.sequelize.query(
        `SELECT COUNT(*) AS count
           FROM ${tableReference(databaseName)}
          WHERE ${quoteIdentifier('payment_timing')} = 'on_dine_in'`
    );
    if (Number(rows?.[0]?.count || 0) > 0) {
        throw new Error(
            `Cannot roll back Dine-in payment timing while ${databaseName}.pos_transactions contains on_dine_in rows`
        );
    }

    const columnType = String(column.COLUMN_TYPE || column.column_type || '').toLowerCase();
    if (!columnType.includes("'on_dine_in'")) return;

    await queryInterface.sequelize.query(
        `ALTER TABLE ${tableReference(databaseName)}
         MODIFY COLUMN ${quoteIdentifier('payment_timing')} ENUM(${PREVIOUS_ENUM_VALUES})
         NOT NULL DEFAULT 'upfront'`
    );
};

module.exports = {
    async up(queryInterface) {
        const currentDatabaseName = await getCurrentDatabaseName(queryInterface);
        if (!currentDatabaseName) return;

        const tenantDatabaseNames = await getActiveTenantDatabaseNames(queryInterface, currentDatabaseName);
        for (const databaseName of [...new Set([currentDatabaseName, ...tenantDatabaseNames])]) {
            await widenPaymentTiming(queryInterface, databaseName);
        }
    },

    async down(queryInterface) {
        const currentDatabaseName = await getCurrentDatabaseName(queryInterface);
        if (!currentDatabaseName) return;

        const tenantDatabaseNames = await getActiveTenantDatabaseNames(queryInterface, currentDatabaseName);
        for (const databaseName of [...new Set([currentDatabaseName, ...tenantDatabaseNames])]) {
            await narrowPaymentTiming(queryInterface, databaseName);
        }
    }
};
