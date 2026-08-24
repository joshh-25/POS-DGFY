'use strict';

const SAFE_IDENTIFIER_PATTERN = /^[A-Za-z0-9_-]+$/;
const PAYMENT_TYPE_ENUM = "'cash','gcash','maya','card','bank_transfer','qrph','employee_credit','grab_pay','shopeepay'";
const PREVIOUS_PAYMENT_TYPE_ENUM = "'cash','gcash','maya','card','bank_transfer','qrph','employee_credit'";

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

const getActiveTenantDatabaseNames = async (queryInterface, currentDatabaseName) => {
  if (!(await tableExists(queryInterface, currentDatabaseName, 'tenants'))) return [];
  const [rows] = await queryInterface.sequelize.query(
    "SELECT DISTINCT db_name FROM tenants WHERE status = 'active' AND db_name IS NOT NULL AND db_name <> ''"
  );
  return rows.map((row) => String(row?.db_name || '').trim()).filter(Boolean);
};

const updatePaymentTypeEnum = async (queryInterface, databaseName, enumValues) => {
  if (!(await tableExists(queryInterface, databaseName, 'pos_transactions'))) return;
  await queryInterface.sequelize.query(`
    ALTER TABLE ${quoteIdentifier(databaseName)}.${quoteIdentifier('pos_transactions')}
    MODIFY COLUMN ${quoteIdentifier('payment_type')} ENUM(${enumValues}) NOT NULL DEFAULT 'cash'
  `);
};

module.exports = {
  async up(queryInterface) {
    const currentDatabaseName = await getCurrentDatabaseName(queryInterface);
    if (!currentDatabaseName) return;
    const tenantDatabaseNames = await getActiveTenantDatabaseNames(queryInterface, currentDatabaseName);
    for (const databaseName of [...new Set([currentDatabaseName, ...tenantDatabaseNames])]) {
      await updatePaymentTypeEnum(queryInterface, databaseName, PAYMENT_TYPE_ENUM);
    }
  },

  async down(queryInterface) {
    const currentDatabaseName = await getCurrentDatabaseName(queryInterface);
    if (!currentDatabaseName) return;
    const tenantDatabaseNames = await getActiveTenantDatabaseNames(queryInterface, currentDatabaseName);
    for (const databaseName of [...new Set([currentDatabaseName, ...tenantDatabaseNames])]) {
      if (!(await tableExists(queryInterface, databaseName, 'pos_transactions'))) continue;
      const [rows] = await queryInterface.sequelize.query(
        `SELECT COUNT(*) AS count FROM ${quoteIdentifier(databaseName)}.${quoteIdentifier('pos_transactions')} WHERE ${quoteIdentifier('payment_type')} IN ('grab_pay', 'shopeepay')`
      );
      if (Number(rows?.[0]?.count || 0) > 0) {
        throw new Error(`Cannot roll back storefront payment methods while ${databaseName} contains GrabPay or ShopeePay transactions`);
      }
      await updatePaymentTypeEnum(queryInterface, databaseName, PREVIOUS_PAYMENT_TYPE_ENUM);
    }
  }
};
