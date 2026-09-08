'use strict';

// item_folders is tenant-scoped. The migration runner connects to the landlord
// database, so existing active tenant databases must be updated explicitly.
// The tenant schema synchronizer carries the same column as the repair path for
// restored or previously missed tenants.

const SAFE_IDENTIFIER_PATTERN = /^[A-Za-z0-9_-]+$/;
const TABLE = 'item_folders';
const COLUMN = 'sort_order';

const quoteIdentifier = (identifier) => {
  const normalized = String(identifier || '').trim();
  if (!SAFE_IDENTIFIER_PATTERN.test(normalized)) throw new Error(`Unsafe database identifier: ${identifier}`);
  return `\`${normalized}\``;
};

const currentDatabase = async (queryInterface) => {
  const [rows] = await queryInterface.sequelize.query('SELECT DATABASE() AS dbName');
  return String(rows?.[0]?.dbName || '').trim();
};

const tableExists = async (queryInterface, databaseName) => {
  const [rows] = await queryInterface.sequelize.query(
    'SELECT COUNT(*) AS count FROM information_schema.tables WHERE table_schema = ? AND table_name = ?',
    { replacements: [databaseName, TABLE] }
  );
  return Number(rows?.[0]?.count || 0) > 0;
};

const columnExists = async (queryInterface, databaseName) => {
  const [rows] = await queryInterface.sequelize.query(
    'SELECT COUNT(*) AS count FROM information_schema.columns WHERE table_schema = ? AND table_name = ? AND column_name = ?',
    { replacements: [databaseName, TABLE, COLUMN] }
  );
  return Number(rows?.[0]?.count || 0) > 0;
};

const targetDatabases = async (queryInterface) => {
  const landlord = await currentDatabase(queryInterface);
  const targets = new Set();
  if (landlord && await tableExists(queryInterface, landlord)) targets.add(landlord);
  const [tenantTableRows] = await queryInterface.sequelize.query(
    'SELECT COUNT(*) AS count FROM information_schema.tables WHERE table_schema = ? AND table_name = ?',
    { replacements: [landlord, 'tenants'] }
  );
  if (Number(tenantTableRows?.[0]?.count || 0) > 0) {
    const [tenants] = await queryInterface.sequelize.query(
      "SELECT DISTINCT db_name FROM tenants WHERE status = 'active' AND db_name IS NOT NULL AND db_name <> ''"
    );
    for (const tenant of tenants) {
      const databaseName = String(tenant?.db_name || '').trim();
      if (databaseName && await tableExists(queryInterface, databaseName)) targets.add(databaseName);
    }
  }
  return [...targets];
};

const addAndBackfill = async (queryInterface, Sequelize, databaseName) => {
  const qualifiedTable = `${quoteIdentifier(databaseName)}.${quoteIdentifier(TABLE)}`;
  if (!(await columnExists(queryInterface, databaseName))) {
    await queryInterface.sequelize.query(
      `ALTER TABLE ${qualifiedTable} ADD COLUMN ${quoteIdentifier(COLUMN)} INTEGER NOT NULL DEFAULT 0`
    );
  }
  const [folders] = await queryInterface.sequelize.query(
    `SELECT folder_id FROM ${qualifiedTable} WHERE deleted_at IS NULL ORDER BY name ASC, folder_id ASC`
  );
  const transaction = await queryInterface.sequelize.transaction();
  try {
    for (let index = 0; index < folders.length; index += 1) {
      await queryInterface.sequelize.query(
        `UPDATE ${qualifiedTable} SET ${quoteIdentifier(COLUMN)} = ? WHERE folder_id = ?`,
        { replacements: [index, folders[index].folder_id], transaction, type: Sequelize.QueryTypes.UPDATE }
      );
    }
    await transaction.commit();
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
};

module.exports = {
  async up(queryInterface, Sequelize) {
    for (const databaseName of await targetDatabases(queryInterface)) {
      await addAndBackfill(queryInterface, Sequelize, databaseName);
    }
  },

  async down(queryInterface) {
    for (const databaseName of await targetDatabases(queryInterface)) {
      if (await columnExists(queryInterface, databaseName)) {
        await queryInterface.sequelize.query(
          `ALTER TABLE ${quoteIdentifier(databaseName)}.${quoteIdentifier(TABLE)} DROP COLUMN ${quoteIdentifier(COLUMN)}`
        );
      }
    }
  }
};
