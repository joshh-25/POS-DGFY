'use strict';

// pos_transaction_discounts is tenant-scoped. Apply the immutable checkout
// snapshot columns to the landlord connection and every active tenant schema.
const SAFE_IDENTIFIER_PATTERN = /^[A-Za-z0-9_-]+$/;
const POS_TRANSACTION_DISCOUNTS_TABLE = 'pos_transaction_discounts';
const SNAPSHOT_COLUMNS = Object.freeze([
  Object.freeze({
    name: 'tax_treatment',
    definition: "VARCHAR(20) NULL COMMENT 'Immutable VAT treatment resolved from the POS tax policy at checkout'"
  }),
  Object.freeze({
    name: 'tax_policy_version',
    definition: "INT NULL COMMENT 'Version of the tenant POS tax policy used for this discount'"
  })
]);

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

module.exports = {
  async up(queryInterface) {
    for (const databaseName of await getTargetDatabaseNames(queryInterface)) {
      if (!(await tableExists(queryInterface, databaseName, POS_TRANSACTION_DISCOUNTS_TABLE))) continue;

      for (const column of SNAPSHOT_COLUMNS) {
        if (await columnExists(queryInterface, databaseName, POS_TRANSACTION_DISCOUNTS_TABLE, column.name)) continue;

        await queryInterface.sequelize.query(
          `ALTER TABLE ${quoteIdentifier(databaseName)}.${quoteIdentifier(POS_TRANSACTION_DISCOUNTS_TABLE)} `
          + `ADD COLUMN ${quoteIdentifier(column.name)} ${column.definition}`
        );
      }
    }
  },

  async down(queryInterface) {
    for (const databaseName of await getTargetDatabaseNames(queryInterface)) {
      if (!(await tableExists(queryInterface, databaseName, POS_TRANSACTION_DISCOUNTS_TABLE))) continue;

      for (const column of [...SNAPSHOT_COLUMNS].reverse()) {
        if (!(await columnExists(queryInterface, databaseName, POS_TRANSACTION_DISCOUNTS_TABLE, column.name))) continue;

        await queryInterface.sequelize.query(
          `ALTER TABLE ${quoteIdentifier(databaseName)}.${quoteIdentifier(POS_TRANSACTION_DISCOUNTS_TABLE)} `
          + `DROP COLUMN ${quoteIdentifier(column.name)}`
        );
      }
    }
  }
};
