'use strict';

// Phase 346 follow-up: 20260924000001 widened these ENUMs on the landlord database only.
// This forward-only repair fans the same definitions out to the landlord and every active
// tenant database so cancellation approvals cannot fail on tenant schemas that predate the
// lifecycle migration.
const SAFE_IDENTIFIER_PATTERN = /^[A-Za-z0-9_-]+$/;
const PARKED_TABLE = 'pos_parked_sales';
const APPROVAL_TABLE = 'business_admin_approval_requests';

const quoteIdentifier = (identifier) => {
    const normalized = String(identifier || '').trim();
    if (!SAFE_IDENTIFIER_PATTERN.test(normalized)) {
        throw new Error(`Unsafe database identifier: ${identifier}`);
    }
    return `\`${normalized}\``;
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

const getDatabaseNames = async (queryInterface) => {
    const [currentRows] = await queryInterface.sequelize.query('SELECT DATABASE() AS dbName');
    const currentDatabaseName = String(currentRows?.[0]?.dbName || '').trim();
    if (!currentDatabaseName) return [];

    let tenantDatabaseNames = [];
    if (await tableExists(queryInterface, currentDatabaseName, 'tenants')) {
        const [rows] = await queryInterface.sequelize.query(
            "SELECT DISTINCT db_name FROM tenants WHERE status = 'active' AND db_name IS NOT NULL AND db_name <> ''"
        );
        tenantDatabaseNames = rows
            .map((row) => String(row?.db_name || '').trim())
            .filter((name) => SAFE_IDENTIFIER_PATTERN.test(name));
    }

    return [...new Set([currentDatabaseName, ...tenantDatabaseNames])];
};

module.exports = {
    async up(queryInterface) {
        for (const databaseName of await getDatabaseNames(queryInterface)) {
            if (await columnExists(queryInterface, databaseName, PARKED_TABLE, 'status')) {
                await queryInterface.sequelize.query(
                    `ALTER TABLE ${quoteIdentifier(databaseName)}.${quoteIdentifier(PARKED_TABLE)} `
                    + "MODIFY COLUMN `status` ENUM('parked','claimed','completed','cancel_pending','cancelled') NOT NULL DEFAULT 'parked'"
                );
            }

            if (await columnExists(queryInterface, databaseName, APPROVAL_TABLE, 'action_type')) {
                await queryInterface.sequelize.query(
                    `ALTER TABLE ${quoteIdentifier(databaseName)}.${quoteIdentifier(APPROVAL_TABLE)} `
                    + "MODIFY COLUMN `action_type` ENUM('pos_refund','force_close_shift','pos_void','pos_parked_sale_cancel') NOT NULL"
                );
            }
        }
    },

    // Forward-only: widening an ENUM is additive; narrowing it during rollback could make
    // existing approval or parked-sale rows invalid and would reintroduce the production bug.
    async down() {}
};
