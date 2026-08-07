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
    `SELECT COUNT(*) AS count FROM information_schema.tables WHERE table_schema = ? AND table_name = ?`,
    { replacements: [databaseName, tableName] }
  );
  return Number(rows?.[0]?.count || 0) > 0;
};

const columnExists = async (queryInterface, databaseName, tableName, columnName) => {
  const [rows] = await queryInterface.sequelize.query(
    `SELECT COUNT(*) AS count FROM information_schema.columns WHERE table_schema = ? AND table_name = ? AND column_name = ?`,
    { replacements: [databaseName, tableName, columnName] }
  );
  return Number(rows?.[0]?.count || 0) > 0;
};

const getActiveTenantDatabaseNames = async (queryInterface, currentDatabaseName) => {
  if (!(await tableExists(queryInterface, currentDatabaseName, 'tenants'))) return [];
  const [rows] = await queryInterface.sequelize.query(
    `SELECT DISTINCT db_name FROM tenants WHERE status = 'active' AND db_name IS NOT NULL AND db_name <> ''`
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

  await queryInterface.sequelize.query(`
    CREATE TABLE IF NOT EXISTS ${quoteIdentifier(databaseName)}.\`employee_credit_accounts\` (
      \`account_id\` INT NOT NULL AUTO_INCREMENT,
      \`user_id\` INT NOT NULL,
      \`account_code\` VARCHAR(40) NOT NULL,
      \`is_eligible\` TINYINT(1) NOT NULL DEFAULT 0,
      \`balance\` DECIMAL(14,4) NOT NULL DEFAULT 0,
      \`credit_limit\` DECIMAL(14,4) NULL,
      \`authorization_pin_hash\` VARCHAR(255) NULL,
      \`version\` INT NOT NULL DEFAULT 0,
      \`created_at\` DATETIME NOT NULL,
      \`updated_at\` DATETIME NOT NULL,
      PRIMARY KEY (\`account_id\`),
      UNIQUE KEY \`uq_employee_credit_accounts_user\` (\`user_id\`),
      UNIQUE KEY \`uq_employee_credit_accounts_code\` (\`account_code\`),
      CONSTRAINT \`fk_employee_credit_accounts_user\` FOREIGN KEY (\`user_id\`) REFERENCES \`users\` (\`user_id\`) ON UPDATE RESTRICT ON DELETE RESTRICT
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await queryInterface.sequelize.query(`
    CREATE TABLE IF NOT EXISTS ${quoteIdentifier(databaseName)}.\`employee_credit_ledger_entries\` (
      \`ledger_entry_id\` INT NOT NULL AUTO_INCREMENT,
      \`account_id\` INT NOT NULL,
      \`pos_transaction_id\` INT NULL,
      \`entry_type\` ENUM('grant','debit','reversal','adjustment','expiration') NOT NULL,
      \`amount\` DECIMAL(14,4) NOT NULL,
      \`balance_before\` DECIMAL(14,4) NOT NULL,
      \`balance_after\` DECIMAL(14,4) NOT NULL,
      \`actor_user_id\` INT NULL,
      \`shift_id\` INT NULL,
      \`terminal_id\` VARCHAR(100) NULL,
      \`location_id\` INT NULL,
      \`authorization_reference\` VARCHAR(80) NULL,
      \`idempotency_key\` VARCHAR(160) NOT NULL,
      \`reason\` VARCHAR(500) NULL,
      \`metadata\` JSON NULL,
      \`created_at\` DATETIME NOT NULL,
      PRIMARY KEY (\`ledger_entry_id\`),
      UNIQUE KEY \`uq_employee_credit_ledger_idempotency\` (\`idempotency_key\`),
      KEY \`idx_employee_credit_ledger_account_created\` (\`account_id\`, \`created_at\`),
      KEY \`idx_employee_credit_ledger_transaction\` (\`pos_transaction_id\`),
      CONSTRAINT \`fk_employee_credit_ledger_account\` FOREIGN KEY (\`account_id\`) REFERENCES \`employee_credit_accounts\` (\`account_id\`) ON UPDATE RESTRICT ON DELETE RESTRICT,
      CONSTRAINT \`fk_employee_credit_ledger_transaction\` FOREIGN KEY (\`pos_transaction_id\`) REFERENCES \`pos_transactions\` (\`pos_transaction_id\`) ON UPDATE RESTRICT ON DELETE RESTRICT
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await queryInterface.sequelize.query(`
    ALTER TABLE ${quoteIdentifier(databaseName)}.\`pos_transactions\`
    MODIFY COLUMN \`payment_type\` ENUM('cash','gcash','maya','card','bank_transfer','qrph','employee_credit') NOT NULL DEFAULT 'cash'
  `);

  await addColumnIfMissing(queryInterface, databaseName, 'pos_transactions', 'employee_credit_account_id', 'INT NULL');
  await addColumnIfMissing(queryInterface, databaseName, 'pos_transactions', 'employee_credit_user_id', 'INT NULL');
  await addColumnIfMissing(queryInterface, databaseName, 'pos_transactions', 'employee_credit_employee_name_snapshot', 'VARCHAR(255) NULL');
  await addColumnIfMissing(queryInterface, databaseName, 'pos_transactions', 'employee_credit_account_code_snapshot', 'VARCHAR(40) NULL');
  await addColumnIfMissing(queryInterface, databaseName, 'pos_transactions', 'employee_credit_amount', 'DECIMAL(14,4) NULL');
  await addColumnIfMissing(queryInterface, databaseName, 'pos_transactions', 'employee_credit_balance_after', 'DECIMAL(14,4) NULL');
  await addColumnIfMissing(queryInterface, databaseName, 'pos_transactions', 'employee_credit_authorization_reference', 'VARCHAR(80) NULL');
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
      if (!(await tableExists(queryInterface, databaseName, 'pos_transactions'))) continue;
      for (const columnName of [
        'employee_credit_authorization_reference',
        'employee_credit_balance_after',
        'employee_credit_amount',
        'employee_credit_account_code_snapshot',
        'employee_credit_employee_name_snapshot',
        'employee_credit_user_id',
        'employee_credit_account_id'
      ]) {
        if (await columnExists(queryInterface, databaseName, 'pos_transactions', columnName)) {
          await queryInterface.sequelize.query(
            `ALTER TABLE ${quoteIdentifier(databaseName)}.\`pos_transactions\` DROP COLUMN ${quoteIdentifier(columnName)}`
          );
        }
      }
      await queryInterface.sequelize.query(`DROP TABLE IF EXISTS ${quoteIdentifier(databaseName)}.\`employee_credit_ledger_entries\``);
      await queryInterface.sequelize.query(`DROP TABLE IF EXISTS ${quoteIdentifier(databaseName)}.\`employee_credit_accounts\``);
      await queryInterface.sequelize.query(`
        ALTER TABLE ${quoteIdentifier(databaseName)}.\`pos_transactions\`
        MODIFY COLUMN \`payment_type\` ENUM('cash','gcash','maya','card','bank_transfer','qrph') NOT NULL DEFAULT 'cash'
      `);
    }
  }
};
