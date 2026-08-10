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

const constraintExists = async (queryInterface, databaseName, tableName, constraintName) => {
  const [rows] = await queryInterface.sequelize.query(
    'SELECT COUNT(*) AS count FROM information_schema.table_constraints WHERE constraint_schema = ? AND table_name = ? AND constraint_name = ?',
    { replacements: [databaseName, tableName, constraintName] }
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

const getActiveTenantDatabaseNames = async (queryInterface, currentDatabaseName) => {
  if (!(await tableExists(queryInterface, currentDatabaseName, 'tenants'))) return [];
  const [rows] = await queryInterface.sequelize.query(
    "SELECT DISTINCT db_name FROM tenants WHERE status = 'active' AND db_name IS NOT NULL AND db_name <> ''"
  );
  return rows.map((row) => String(row?.db_name || '').trim()).filter(Boolean);
};

const addColumnIfMissing = async (queryInterface, databaseName, tableName, columnName, definition) => {
  if (await columnExists(queryInterface, databaseName, tableName, columnName)) return;
  await queryInterface.sequelize.query(
    `ALTER TABLE ${quoteIdentifier(databaseName)}.${quoteIdentifier(tableName)} ADD COLUMN ${quoteIdentifier(columnName)} ${definition}`
  );
};

const migrateDatabase = async (queryInterface, databaseName) => {
  if (!(await tableExists(queryInterface, databaseName, 'pos_transactions'))) return;

  const hasTenantLocations = await tableExists(queryInterface, databaseName, 'tenant_locations');
  const hasUsers = await tableExists(queryInterface, databaseName, 'users');
  const employeeForeignKeys = [
    hasTenantLocations
      ? 'CONSTRAINT `fk_employees_location` FOREIGN KEY (`location_id`) REFERENCES `tenant_locations` (`location_id`) ON UPDATE RESTRICT ON DELETE SET NULL'
      : null,
    hasUsers
      ? 'CONSTRAINT `fk_employees_created_by` FOREIGN KEY (`created_by`) REFERENCES `users` (`user_id`) ON UPDATE RESTRICT ON DELETE SET NULL'
      : null,
    hasUsers
      ? 'CONSTRAINT `fk_employees_updated_by` FOREIGN KEY (`updated_by`) REFERENCES `users` (`user_id`) ON UPDATE RESTRICT ON DELETE SET NULL'
      : null
  ].filter(Boolean).join(',\n      ');
  const employeeForeignKeysSql = employeeForeignKeys ? `,\n      ${employeeForeignKeys}` : '';

  await queryInterface.sequelize.query(`
    CREATE TABLE IF NOT EXISTS ${quoteIdentifier(databaseName)}.\`employees\` (
      \`employee_id\` INT NOT NULL AUTO_INCREMENT,
      \`employee_code\` VARCHAR(40) NOT NULL,
      \`full_name\` VARCHAR(255) NOT NULL,
      \`email\` VARCHAR(255) NULL,
      \`phone\` VARCHAR(40) NULL,
      \`location_id\` INT NULL,
      \`is_active\` TINYINT(1) NOT NULL DEFAULT 1,
      \`created_by\` INT NULL,
      \`updated_by\` INT NULL,
      \`created_at\` DATETIME NOT NULL,
      \`updated_at\` DATETIME NOT NULL,
      PRIMARY KEY (\`employee_id\`),
      UNIQUE KEY \`uq_employees_code\` (\`employee_code\`),
      KEY \`idx_employees_name\` (\`full_name\`),
      KEY \`idx_employees_location_active\` (\`location_id\`, \`is_active\`)${employeeForeignKeysSql}
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  if (await tableExists(queryInterface, databaseName, 'employee_credit_accounts')) {
    await queryInterface.sequelize.query(
      `ALTER TABLE ${quoteIdentifier(databaseName)}.\`employee_credit_accounts\` MODIFY COLUMN \`user_id\` INT NULL`
    );
    await addColumnIfMissing(queryInterface, databaseName, 'employee_credit_accounts', 'employee_id', 'INT NULL AFTER `user_id`');
    if (!(await indexExists(queryInterface, databaseName, 'employee_credit_accounts', 'uq_employee_credit_accounts_employee'))) {
      await queryInterface.sequelize.query(
        `ALTER TABLE ${quoteIdentifier(databaseName)}.\`employee_credit_accounts\` ADD UNIQUE KEY \`uq_employee_credit_accounts_employee\` (\`employee_id\`)`
      );
    }
    if (!(await constraintExists(queryInterface, databaseName, 'employee_credit_accounts', 'fk_employee_credit_accounts_employee'))) {
      await queryInterface.sequelize.query(
        `ALTER TABLE ${quoteIdentifier(databaseName)}.\`employee_credit_accounts\` ADD CONSTRAINT \`fk_employee_credit_accounts_employee\` FOREIGN KEY (\`employee_id\`) REFERENCES \`employees\` (\`employee_id\`) ON UPDATE RESTRICT ON DELETE RESTRICT`
      );
    }
  }

  await addColumnIfMissing(queryInterface, databaseName, 'pos_transactions', 'employee_credit_employee_id', 'INT NULL AFTER `employee_credit_user_id`');
};

module.exports = {
  async up(queryInterface) {
    const currentDatabaseName = await getCurrentDatabaseName(queryInterface);
    if (!currentDatabaseName) return;
    const tenantDatabaseNames = await getActiveTenantDatabaseNames(queryInterface, currentDatabaseName);
    for (const databaseName of [...new Set([currentDatabaseName, ...tenantDatabaseNames])]) {
      await migrateDatabase(queryInterface, databaseName);
    }
  },

  async down(queryInterface) {
    const currentDatabaseName = await getCurrentDatabaseName(queryInterface);
    if (!currentDatabaseName) return;
    const tenantDatabaseNames = await getActiveTenantDatabaseNames(queryInterface, currentDatabaseName);
    for (const databaseName of [...new Set([currentDatabaseName, ...tenantDatabaseNames])]) {
      if (await columnExists(queryInterface, databaseName, 'pos_transactions', 'employee_credit_employee_id')) {
        await queryInterface.sequelize.query(
          `ALTER TABLE ${quoteIdentifier(databaseName)}.\`pos_transactions\` DROP COLUMN \`employee_credit_employee_id\``
        );
      }
      if (await tableExists(queryInterface, databaseName, 'employee_credit_accounts')) {
        const [employeeOnlyAccounts] = await queryInterface.sequelize.query(
          `SELECT COUNT(*) AS count FROM ${quoteIdentifier(databaseName)}.\`employee_credit_accounts\` WHERE \`user_id\` IS NULL`
        );
        if (Number(employeeOnlyAccounts?.[0]?.count || 0) > 0) {
          throw new Error(
            `Cannot roll back employee directory in ${databaseName}: employee-only credit accounts exist`
          );
        }
        if (await constraintExists(queryInterface, databaseName, 'employee_credit_accounts', 'fk_employee_credit_accounts_employee')) {
          await queryInterface.sequelize.query(
            `ALTER TABLE ${quoteIdentifier(databaseName)}.\`employee_credit_accounts\` DROP FOREIGN KEY \`fk_employee_credit_accounts_employee\``
          );
        }
        if (await indexExists(queryInterface, databaseName, 'employee_credit_accounts', 'uq_employee_credit_accounts_employee')) {
          await queryInterface.sequelize.query(
            `ALTER TABLE ${quoteIdentifier(databaseName)}.\`employee_credit_accounts\` DROP INDEX \`uq_employee_credit_accounts_employee\``
          );
        }
        if (await columnExists(queryInterface, databaseName, 'employee_credit_accounts', 'employee_id')) {
          await queryInterface.sequelize.query(
            `ALTER TABLE ${quoteIdentifier(databaseName)}.\`employee_credit_accounts\` DROP COLUMN \`employee_id\``
          );
        }
        await queryInterface.sequelize.query(
          `ALTER TABLE ${quoteIdentifier(databaseName)}.\`employee_credit_accounts\` MODIFY COLUMN \`user_id\` INT NOT NULL`
        );
      }
      await queryInterface.sequelize.query(`DROP TABLE IF EXISTS ${quoteIdentifier(databaseName)}.\`employees\``);
    }
  }
};
