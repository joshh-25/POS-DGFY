'use strict';

// Phase 333 (#1461): loading verification belongs to the tenant-local delivery run/job records.
// The standalone migration runner connects to the landlord database, so this migration explicitly
// fans out across the landlord and every active tenant database, matching recent evidence migrations.

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
  return String(rows?.[0]?.dbName || '').trim();
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

const indexExists = async (queryInterface, databaseName, tableName, indexName) => {
  const [rows] = await queryInterface.sequelize.query(
    'SELECT COUNT(*) AS count FROM information_schema.statistics WHERE table_schema = ? AND table_name = ? AND index_name = ?',
    { replacements: [databaseName, tableName, indexName] }
  );
  return Number(rows?.[0]?.count || 0) > 0;
};

const foreignKeyExists = async (queryInterface, databaseName, tableName, constraintName) => {
  const [rows] = await queryInterface.sequelize.query(
    "SELECT COUNT(*) AS count FROM information_schema.table_constraints WHERE constraint_schema = ? AND table_name = ? AND constraint_name = ? AND constraint_type = 'FOREIGN KEY'",
    { replacements: [databaseName, tableName, constraintName] }
  );
  return Number(rows?.[0]?.count || 0) > 0;
};

const getActiveTenantDatabaseNames = async (queryInterface, currentDatabaseName) => {
  if (!(await tableExists(queryInterface, currentDatabaseName, 'tenants'))) return [];
  const [rows] = await queryInterface.sequelize.query(
    "SELECT DISTINCT db_name FROM tenants WHERE status = 'active' AND db_name IS NOT NULL AND db_name <> ''"
  );
  return rows
    .map((row) => String(row?.db_name || '').trim())
    .filter((name) => SAFE_IDENTIFIER_PATTERN.test(name));
};

const addColumnIfMissing = async (queryInterface, databaseName, tableName, columnName, definition) => {
  if (await columnExists(queryInterface, databaseName, tableName, columnName)) return;
  await queryInterface.sequelize.query(
    `ALTER TABLE ${quoteIdentifier(databaseName)}.${quoteIdentifier(tableName)} ADD COLUMN ${quoteIdentifier(columnName)} ${definition}`
  );
};

const addForeignKeyIfMissing = async (queryInterface, databaseName, tableName, constraintName, columnName) => {
  if (await foreignKeyExists(queryInterface, databaseName, tableName, constraintName)) return;
  await queryInterface.sequelize.query(
    `ALTER TABLE ${quoteIdentifier(databaseName)}.${quoteIdentifier(tableName)} `
      + `ADD CONSTRAINT ${quoteIdentifier(constraintName)} FOREIGN KEY (${quoteIdentifier(columnName)}) `
      + `REFERENCES ${quoteIdentifier(databaseName)}.${quoteIdentifier('users')} (${quoteIdentifier('user_id')}) `
      + 'ON DELETE SET NULL ON UPDATE RESTRICT'
  );
};

const removeForeignKeyIfPresent = async (queryInterface, databaseName, tableName, constraintName) => {
  if (!(await foreignKeyExists(queryInterface, databaseName, tableName, constraintName))) return;
  await queryInterface.sequelize.query(
    `ALTER TABLE ${quoteIdentifier(databaseName)}.${quoteIdentifier(tableName)} DROP FOREIGN KEY ${quoteIdentifier(constraintName)}`
  );
};

const databaseNames = async (queryInterface) => {
  const currentDatabaseName = await getCurrentDatabaseName(queryInterface);
  if (!currentDatabaseName) return [];
  const tenantDatabaseNames = await getActiveTenantDatabaseNames(queryInterface, currentDatabaseName);
  return [...new Set([currentDatabaseName, ...tenantDatabaseNames])];
};

module.exports = {
  async up(queryInterface) {
    for (const databaseName of await databaseNames(queryInterface)) {
      const hasDeliveryJobs = await tableExists(queryInterface, databaseName, 'delivery_jobs');
      const hasDeliveryRuns = await tableExists(queryInterface, databaseName, 'delivery_runs');
      const hasUsers = await tableExists(queryInterface, databaseName, 'users');

      if (hasDeliveryJobs) {
        await addColumnIfMissing(queryInterface, databaseName, 'delivery_jobs', 'loading_state', "ENUM('pending','loaded','not_loaded','exception') NOT NULL DEFAULT 'pending'");
        await addColumnIfMissing(queryInterface, databaseName, 'delivery_jobs', 'loading_exception_reason', 'TEXT NULL');
        await addColumnIfMissing(queryInterface, databaseName, 'delivery_jobs', 'loading_marked_by', 'INT NULL');
        await addColumnIfMissing(queryInterface, databaseName, 'delivery_jobs', 'loading_marked_at', 'DATETIME NULL');
        if (hasUsers) {
          await addForeignKeyIfMissing(queryInterface, databaseName, 'delivery_jobs', 'fk_delivery_jobs_loading_marked_by', 'loading_marked_by');
        }
        if (!(await indexExists(queryInterface, databaseName, 'delivery_jobs', 'idx_delivery_jobs_run_loading_state'))) {
          await queryInterface.sequelize.query(
            `ALTER TABLE ${quoteIdentifier(databaseName)}.${quoteIdentifier('delivery_jobs')} `
              + `ADD INDEX ${quoteIdentifier('idx_delivery_jobs_run_loading_state')} `
              + `(${quoteIdentifier('delivery_run_id')},${quoteIdentifier('loading_state')})`
          );
        }
      }

      if (hasDeliveryRuns) {
        await addColumnIfMissing(queryInterface, databaseName, 'delivery_runs', 'loading_confirmed_by', 'INT NULL');
        await addColumnIfMissing(queryInterface, databaseName, 'delivery_runs', 'loading_confirmed_at', 'DATETIME NULL');
        if (hasUsers) {
          await addForeignKeyIfMissing(queryInterface, databaseName, 'delivery_runs', 'fk_delivery_runs_loading_confirmed_by', 'loading_confirmed_by');
        }
      }
    }
  },

  async down(queryInterface) {
    for (const databaseName of await databaseNames(queryInterface)) {
      if (await tableExists(queryInterface, databaseName, 'delivery_jobs')) {
        await removeForeignKeyIfPresent(queryInterface, databaseName, 'delivery_jobs', 'fk_delivery_jobs_loading_marked_by');
        if (await indexExists(queryInterface, databaseName, 'delivery_jobs', 'idx_delivery_jobs_run_loading_state')) {
          await queryInterface.sequelize.query(
            `ALTER TABLE ${quoteIdentifier(databaseName)}.${quoteIdentifier('delivery_jobs')} DROP INDEX ${quoteIdentifier('idx_delivery_jobs_run_loading_state')}`
          );
        }
        for (const columnName of ['loading_marked_at', 'loading_marked_by', 'loading_exception_reason', 'loading_state']) {
          if (await columnExists(queryInterface, databaseName, 'delivery_jobs', columnName)) {
            await queryInterface.sequelize.query(
              `ALTER TABLE ${quoteIdentifier(databaseName)}.${quoteIdentifier('delivery_jobs')} DROP COLUMN ${quoteIdentifier(columnName)}`
            );
          }
        }
      }

      if (await tableExists(queryInterface, databaseName, 'delivery_runs')) {
        await removeForeignKeyIfPresent(queryInterface, databaseName, 'delivery_runs', 'fk_delivery_runs_loading_confirmed_by');
        for (const columnName of ['loading_confirmed_at', 'loading_confirmed_by']) {
          if (await columnExists(queryInterface, databaseName, 'delivery_runs', columnName)) {
            await queryInterface.sequelize.query(
              `ALTER TABLE ${quoteIdentifier(databaseName)}.${quoteIdentifier('delivery_runs')} DROP COLUMN ${quoteIdentifier(columnName)}`
            );
          }
        }
      }
    }
  }
};
