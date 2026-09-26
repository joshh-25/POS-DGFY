'use strict';

// Phase 388. Tenant-local operational expense ledger for the POS Business Admin
// surface. The ledger deliberately stores operational evidence only; it is not a
// statutory general ledger and does not infer tax or profit-after-expenses.

const SAFE_IDENTIFIER_PATTERN = /^[A-Za-z0-9_-]+$/;
const TABLE_NAME = 'business_admin_expenses';

const quoteIdentifier = (identifier) => {
  const normalized = String(identifier || '').trim();
  if (!SAFE_IDENTIFIER_PATTERN.test(normalized)) throw new Error(`Unsafe database identifier: ${identifier}`);
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

const createTableSql = (qualifiedTable) => `
  CREATE TABLE IF NOT EXISTS ${qualifiedTable} (
    \`business_admin_expense_id\` INT UNSIGNED NOT NULL AUTO_INCREMENT,
    \`expense_date\` DATE NOT NULL,
    \`location_id\` INT NULL,
    \`location_name_snapshot\` VARCHAR(255) NULL,
    \`category\` VARCHAR(80) NOT NULL,
    \`description\` VARCHAR(255) NOT NULL,
    \`amount\` DECIMAL(14,4) NOT NULL,
    \`currency\` VARCHAR(3) NOT NULL DEFAULT 'PHP',
    \`payment_method\` ENUM('cash','bank_transfer','card','gcash','maya','other') NOT NULL DEFAULT 'cash',
    \`vendor_name\` VARCHAR(160) NULL,
    \`reference\` VARCHAR(120) NULL,
    \`notes\` VARCHAR(500) NULL,
    \`status\` ENUM('posted','voided') NOT NULL DEFAULT 'posted',
    \`created_by\` INT UNSIGNED NOT NULL,
    \`voided_by\` INT UNSIGNED NULL,
    \`voided_at\` DATETIME NULL,
    \`void_reason\` VARCHAR(500) NULL,
    \`idempotency_key\` VARCHAR(120) NOT NULL,
    \`created_at\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    \`updated_at\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (\`business_admin_expense_id\`),
    UNIQUE KEY \`uq_business_admin_expenses_idempotency\` (\`idempotency_key\`),
    KEY \`idx_business_admin_expenses_date_location_status\` (\`expense_date\`,\`location_id\`,\`status\`),
    KEY \`idx_business_admin_expenses_category_date\` (\`category\`,\`expense_date\`),
    KEY \`idx_business_admin_expenses_created_by_date\` (\`created_by\`,\`created_at\`)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci
`;

const databasesForMigration = async (queryInterface) => {
  const currentDatabaseName = await getCurrentDatabaseName(queryInterface);
  if (!currentDatabaseName) return [];
  const tenantDatabaseNames = await getActiveTenantDatabaseNames(queryInterface, currentDatabaseName);
  return [...new Set([currentDatabaseName, ...tenantDatabaseNames])];
};

module.exports = {
  async up(queryInterface) {
    const databases = await databasesForMigration(queryInterface);
    for (const databaseName of databases) {
      await queryInterface.sequelize.query(
        createTableSql(`${quoteIdentifier(databaseName)}.${quoteIdentifier(TABLE_NAME)}`)
      );
    }
  },

  async down(queryInterface) {
    const databases = await databasesForMigration(queryInterface);
    for (const databaseName of databases) {
      if (!(await tableExists(queryInterface, databaseName, TABLE_NAME))) continue;
      await queryInterface.sequelize.query(
        `DROP TABLE ${quoteIdentifier(databaseName)}.${quoteIdentifier(TABLE_NAME)}`
      );
    }
  }
};
