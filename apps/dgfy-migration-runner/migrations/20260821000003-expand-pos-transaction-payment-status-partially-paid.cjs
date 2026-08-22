'use strict';

// Phase 137 (#819) -- ADR 0069 clause 4 (carried over verbatim from ADR 0068 clause 4, unchanged
// by the supersession). Same tenant-fan-out shape as
// 20260817000001-expand-storefront-paymongo-payment-methods.cjs.

const SAFE_IDENTIFIER_PATTERN = /^[A-Za-z0-9_-]+$/;
const PAYMENT_STATUS_ENUM = "'unpaid','payment_pending','paid','partially_paid','failed','refund_pending','partial_refunded','refunded'";
const PREVIOUS_PAYMENT_STATUS_ENUM = "'unpaid','payment_pending','paid','failed','refund_pending','partial_refunded','refunded'";

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

const updatePaymentStatusEnum = async (queryInterface, databaseName, enumValues) => {
  if (!(await tableExists(queryInterface, databaseName, 'pos_transactions'))) return;
  await queryInterface.sequelize.query(`
    ALTER TABLE ${quoteIdentifier(databaseName)}.${quoteIdentifier('pos_transactions')}
    MODIFY COLUMN ${quoteIdentifier('payment_status')} ENUM(${enumValues}) NOT NULL DEFAULT 'paid'
  `);
};

module.exports = {
  async up(queryInterface) {
    const currentDatabaseName = await getCurrentDatabaseName(queryInterface);
    if (!currentDatabaseName) return;
    const tenantDatabaseNames = await getActiveTenantDatabaseNames(queryInterface, currentDatabaseName);
    for (const databaseName of [...new Set([currentDatabaseName, ...tenantDatabaseNames])]) {
      await updatePaymentStatusEnum(queryInterface, databaseName, PAYMENT_STATUS_ENUM);
    }
  },

  async down(queryInterface) {
    const currentDatabaseName = await getCurrentDatabaseName(queryInterface);
    if (!currentDatabaseName) return;
    const tenantDatabaseNames = await getActiveTenantDatabaseNames(queryInterface, currentDatabaseName);
    for (const databaseName of [...new Set([currentDatabaseName, ...tenantDatabaseNames])]) {
      if (!(await tableExists(queryInterface, databaseName, 'pos_transactions'))) continue;
      const [rows] = await queryInterface.sequelize.query(
        `SELECT COUNT(*) AS count FROM ${quoteIdentifier(databaseName)}.${quoteIdentifier('pos_transactions')} WHERE ${quoteIdentifier('payment_status')} = 'partially_paid'`
      );
      if (Number(rows?.[0]?.count || 0) > 0) {
        throw new Error(`Cannot roll back payment_status widening while ${databaseName} contains partially_paid transactions`);
      }
      await updatePaymentStatusEnum(queryInterface, databaseName, PREVIOUS_PAYMENT_STATUS_ENUM);
    }
  }
};
