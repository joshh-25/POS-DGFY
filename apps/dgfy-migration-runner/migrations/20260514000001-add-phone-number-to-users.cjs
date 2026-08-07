'use strict';

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
        `SELECT COUNT(*) AS count
         FROM information_schema.tables
         WHERE table_schema = ? AND table_name = ?`,
        { replacements: [databaseName, tableName] }
    );
    return Number(rows?.[0]?.count || 0) > 0;
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

const getActiveTenantDatabaseNames = async (queryInterface) => {
    const currentDatabaseName = await getCurrentDatabaseName(queryInterface);
    if (!currentDatabaseName) return [];

    const hasTenantsTable = await tableExists(queryInterface, currentDatabaseName, 'tenants');
    if (!hasTenantsTable) return [];

    const hasDbNameColumn = await columnExists(queryInterface, currentDatabaseName, 'tenants', 'db_name');
    if (!hasDbNameColumn) return [];

    const hasStatusColumn = await columnExists(queryInterface, currentDatabaseName, 'tenants', 'status');
    const whereClause = hasStatusColumn
        ? "WHERE status = 'active' AND db_name IS NOT NULL AND db_name <> ''"
        : "WHERE db_name IS NOT NULL AND db_name <> ''";
    const [rows] = await queryInterface.sequelize.query(
        `SELECT DISTINCT db_name FROM tenants ${whereClause}`
    );

    return rows
        .map((row) => String(row?.db_name || '').trim())
        .filter(Boolean);
};

const addPhoneNumberColumnIfMissing = async (queryInterface, Sequelize, databaseName) => {
    if (!databaseName) return;
    const quotedDatabaseName = quoteIdentifier(databaseName);
    const hasUsersTable = await tableExists(queryInterface, databaseName, 'users');
    if (!hasUsersTable) return;

    const hasPhoneNumberColumn = await columnExists(queryInterface, databaseName, 'users', 'phone_number');
    if (hasPhoneNumberColumn) return;

    await queryInterface.sequelize.query(
        `ALTER TABLE ${quotedDatabaseName}.\`users\`
         ADD COLUMN \`phone_number\` ${Sequelize.STRING(40).toSql()} NULL AFTER \`email\``
    );
};

const removePhoneNumberColumnIfPresent = async (queryInterface, databaseName) => {
    if (!databaseName) return;
    const quotedDatabaseName = quoteIdentifier(databaseName);
    const hasUsersTable = await tableExists(queryInterface, databaseName, 'users');
    if (!hasUsersTable) return;

    const hasPhoneNumberColumn = await columnExists(queryInterface, databaseName, 'users', 'phone_number');
    if (!hasPhoneNumberColumn) return;

    await queryInterface.sequelize.query(
        `ALTER TABLE ${quotedDatabaseName}.\`users\` DROP COLUMN \`phone_number\``
    );
};

/** @type {import('sequelize-cli').Migration} */
module.exports = {
    async up(queryInterface, Sequelize) {
        const currentDatabaseName = await getCurrentDatabaseName(queryInterface);
        const tenantDatabaseNames = await getActiveTenantDatabaseNames(queryInterface);
        const databaseNames = [...new Set([currentDatabaseName, ...tenantDatabaseNames].filter(Boolean))];

        for (const databaseName of databaseNames) {
            await addPhoneNumberColumnIfMissing(queryInterface, Sequelize, databaseName);
        }
    },

    async down(queryInterface) {
        const currentDatabaseName = await getCurrentDatabaseName(queryInterface);
        const tenantDatabaseNames = await getActiveTenantDatabaseNames(queryInterface);
        const databaseNames = [...new Set([currentDatabaseName, ...tenantDatabaseNames].filter(Boolean))];

        for (const databaseName of databaseNames) {
            await removePhoneNumberColumnIfPresent(queryInterface, databaseName);
        }
    }
};
