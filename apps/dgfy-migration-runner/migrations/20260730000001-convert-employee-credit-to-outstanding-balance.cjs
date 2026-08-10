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
  if (!(await tableExists(queryInterface, databaseName, 'employee_credit_accounts'))) return;

  await addColumnIfMissing(
    queryInterface,
    databaseName,
    'employee_credit_accounts',
    'outstanding_balance',
    'DECIMAL(14,4) NOT NULL DEFAULT 0 AFTER `balance`'
  );

  if (await tableExists(queryInterface, databaseName, 'employee_credit_ledger_entries')) {
    await queryInterface.sequelize.query(`
      ALTER TABLE ${quoteIdentifier(databaseName)}.\`employee_credit_ledger_entries\`
      MODIFY COLUMN \`entry_type\`
      ENUM('grant','debit','charge','repayment','reversal','adjustment','expiration') NOT NULL
    `);
  }

  if (await tableExists(queryInterface, databaseName, 'pos_transactions')) {
    await addColumnIfMissing(
      queryInterface,
      databaseName,
      'pos_transactions',
      'employee_credit_outstanding_after',
      'DECIMAL(14,4) NULL AFTER `employee_credit_balance_after`'
    );
  }
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
      if (await tableExists(queryInterface, databaseName, 'pos_transactions')
        && await columnExists(queryInterface, databaseName, 'pos_transactions', 'employee_credit_outstanding_after')) {
        await queryInterface.sequelize.query(
          `ALTER TABLE ${quoteIdentifier(databaseName)}.\`pos_transactions\` DROP COLUMN \`employee_credit_outstanding_after\``
        );
      }
      if (await tableExists(queryInterface, databaseName, 'employee_credit_accounts')
        && await columnExists(queryInterface, databaseName, 'employee_credit_accounts', 'outstanding_balance')) {
        await queryInterface.sequelize.query(
          `ALTER TABLE ${quoteIdentifier(databaseName)}.\`employee_credit_accounts\` DROP COLUMN \`outstanding_balance\``
        );
      }
    }
  }
};
