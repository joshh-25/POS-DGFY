'use strict';

// F&B checks are tenant-local but must be bound to the active POS branch at
// checkout. The unique transaction link is the database backstop for the
// application-level row lock, so a retry cannot settle one check twice.

const SAFE_IDENTIFIER_PATTERN = /^[A-Za-z0-9_-]+$/;
const TABLE_NAME = 'fnb_checks';
const LOCATION_COLUMN = 'location_id';
const LOCATION_INDEX = 'idx_fnb_checks_location_status_opened';
const TRANSACTION_UNIQUE_INDEX = 'uq_fnb_checks_pos_transaction_id';

const quoteIdentifier = (identifier) => {
  const normalized = String(identifier || '').trim();
  if (!SAFE_IDENTIFIER_PATTERN.test(normalized)) throw new Error(`Unsafe database identifier: ${identifier}`);
  return `\`${normalized}\``;
};

const getCurrentDatabaseName = async (queryInterface) => {
  const [rows] = await queryInterface.sequelize.query('SELECT DATABASE() AS dbName');
  return String(rows?.[0]?.dbName || '').trim();
};

const tableExists = async (queryInterface, databaseName) => {
  const [rows] = await queryInterface.sequelize.query(
    'SELECT COUNT(*) AS count FROM information_schema.tables WHERE table_schema = ? AND table_name = ?',
    { replacements: [databaseName, TABLE_NAME] }
  );
  return Number(rows?.[0]?.count || 0) > 0;
};

const columnExists = async (queryInterface, databaseName) => {
  const [rows] = await queryInterface.sequelize.query(
    'SELECT COUNT(*) AS count FROM information_schema.columns WHERE table_schema = ? AND table_name = ? AND column_name = ?',
    { replacements: [databaseName, TABLE_NAME, LOCATION_COLUMN] }
  );
  return Number(rows?.[0]?.count || 0) > 0;
};

const indexExists = async (queryInterface, databaseName, indexName) => {
  const [rows] = await queryInterface.sequelize.query(
    'SELECT COUNT(*) AS count FROM information_schema.statistics WHERE table_schema = ? AND table_name = ? AND index_name = ?',
    { replacements: [databaseName, TABLE_NAME, indexName] }
  );
  return Number(rows?.[0]?.count || 0) > 0;
};

const databasesForMigration = async (queryInterface) => {
  const currentDatabaseName = await getCurrentDatabaseName(queryInterface);
  if (!currentDatabaseName) return [];
  const databases = new Set([currentDatabaseName]);
  const [tenantTableRows] = await queryInterface.sequelize.query(
    'SELECT COUNT(*) AS count FROM information_schema.tables WHERE table_schema = ? AND table_name = ?',
    { replacements: [currentDatabaseName, 'tenants'] }
  );
  if (Number(tenantTableRows?.[0]?.count || 0) === 0) return [...databases];
  const [tenantRows] = await queryInterface.sequelize.query(
    "SELECT DISTINCT db_name FROM tenants WHERE status = 'active' AND db_name IS NOT NULL AND db_name <> ''"
  );
  for (const row of tenantRows || []) {
    const databaseName = String(row?.db_name || '').trim();
    if (databaseName) databases.add(databaseName);
  }
  return [...databases].filter((databaseName) => databaseName);
};

const applyToDatabase = async (queryInterface, databaseName) => {
  if (!(await tableExists(queryInterface, databaseName))) return;
  const qualifiedTable = `${quoteIdentifier(databaseName)}.${quoteIdentifier(TABLE_NAME)}`;

  if (!(await columnExists(queryInterface, databaseName))) {
    await queryInterface.sequelize.query(
      `ALTER TABLE ${qualifiedTable} ADD COLUMN ${quoteIdentifier(LOCATION_COLUMN)} INT NULL`
    );
  }

  if (!(await indexExists(queryInterface, databaseName, LOCATION_INDEX))) {
    await queryInterface.sequelize.query(
      `ALTER TABLE ${qualifiedTable} ADD KEY ${quoteIdentifier(LOCATION_INDEX)} (${quoteIdentifier(LOCATION_COLUMN)}, ${quoteIdentifier('status')}, ${quoteIdentifier('opened_at')})`
    );
  }

  if (!(await indexExists(queryInterface, databaseName, TRANSACTION_UNIQUE_INDEX))) {
    await queryInterface.sequelize.query(
      `ALTER TABLE ${qualifiedTable} ADD UNIQUE KEY ${quoteIdentifier(TRANSACTION_UNIQUE_INDEX)} (${quoteIdentifier('pos_transaction_id')})`
    );
  }
};

module.exports = {
  async up(queryInterface) {
    for (const databaseName of await databasesForMigration(queryInterface)) {
      await applyToDatabase(queryInterface, databaseName);
    }
  },

  async down(queryInterface) {
    for (const databaseName of await databasesForMigration(queryInterface)) {
      if (!(await tableExists(queryInterface, databaseName))) continue;
      const qualifiedTable = `${quoteIdentifier(databaseName)}.${quoteIdentifier(TABLE_NAME)}`;
      if (await indexExists(queryInterface, databaseName, TRANSACTION_UNIQUE_INDEX)) {
        await queryInterface.sequelize.query(
          `ALTER TABLE ${qualifiedTable} DROP INDEX ${quoteIdentifier(TRANSACTION_UNIQUE_INDEX)}`
        );
      }
      if (await indexExists(queryInterface, databaseName, LOCATION_INDEX)) {
        await queryInterface.sequelize.query(
          `ALTER TABLE ${qualifiedTable} DROP INDEX ${quoteIdentifier(LOCATION_INDEX)}`
        );
      }
      if (await columnExists(queryInterface, databaseName)) {
        await queryInterface.sequelize.query(
          `ALTER TABLE ${qualifiedTable} DROP COLUMN ${quoteIdentifier(LOCATION_COLUMN)}`
        );
      }
    }
  }
};
