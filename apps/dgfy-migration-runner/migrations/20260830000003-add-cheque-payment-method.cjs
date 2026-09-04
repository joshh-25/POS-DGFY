'use strict';

// Phase 202 (#1085). Adds `cheque` as a sixth balance-settlement / split-tender method. ADR 0063
// clause 4 [binding] is scoped-superseded by ADR 0077 for exactly this widening; every other
// clause of ADR 0063 is unaffected. `cheque` is appended LAST in every ENUM below -- MySQL stores
// ENUM ordinals, so appending is index-stable and inserting mid-list would silently reinterpret
// every existing row.
//
// Copies the structure of 20260817000001-expand-storefront-paymongo-payment-methods.cjs
// (the grab_pay/shopeepay widening) verbatim: iterate every active tenant database, not just the
// one this process is connected to, so a raw queryInterface.changeColumn -- which only touches the
// connected DB -- doesn't silently leave every tenant schema behind (the #860/#639 crash-loop
// class, docs/ops/TENANT_SCHEMA_SYNC_RESIDUAL_RISK_TRACKER.md).
//
// Three tables widen together, in this one migration: pos_order_payments.payment_method (Settle
// Balance's own writer) and, because split tender is in scope for this phase (ADR 0077 Decision
// 4), pos_transactions.payment_type (a split allocation copies its method onto the parent
// transaction -- splitPaymentUseCases.js) and pos_payment_allocations.payment_method (the
// split-tender allocation ledger itself). Widening one without the other two would produce a
// runtime ENUM-truncation write failure on the first cheque split allocation.

const SAFE_IDENTIFIER_PATTERN = /^[A-Za-z0-9_-]+$/;

const POS_ORDER_PAYMENTS_ENUM = "'cash','gcash','maya','card','bank_transfer','qrph','employee_credit','grab_pay','shopeepay','cheque'";
const PREVIOUS_POS_ORDER_PAYMENTS_ENUM = "'cash','gcash','maya','card','bank_transfer','qrph','employee_credit','grab_pay','shopeepay'";

const POS_TRANSACTIONS_PAYMENT_TYPE_ENUM = "'cash','gcash','maya','card','bank_transfer','qrph','employee_credit','grab_pay','shopeepay','cheque'";
const PREVIOUS_POS_TRANSACTIONS_PAYMENT_TYPE_ENUM = "'cash','gcash','maya','card','bank_transfer','qrph','employee_credit','grab_pay','shopeepay'";

const POS_PAYMENT_ALLOCATIONS_ENUM = "'cash','gcash','maya','card','bank_transfer','cheque'";
const PREVIOUS_POS_PAYMENT_ALLOCATIONS_ENUM = "'cash','gcash','maya','card','bank_transfer'";

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

// One (table, column, enumValues) triple per widened column. `defaultClause` mirrors each
// column's own current DEFAULT so the MODIFY COLUMN doesn't accidentally drop it.
const WIDENED_COLUMNS = [
  {
    table: 'pos_order_payments',
    column: 'payment_method',
    enumValues: POS_ORDER_PAYMENTS_ENUM,
    previousEnumValues: PREVIOUS_POS_ORDER_PAYMENTS_ENUM,
    defaultClause: ''
  },
  {
    table: 'pos_transactions',
    column: 'payment_type',
    enumValues: POS_TRANSACTIONS_PAYMENT_TYPE_ENUM,
    previousEnumValues: PREVIOUS_POS_TRANSACTIONS_PAYMENT_TYPE_ENUM,
    defaultClause: " DEFAULT 'cash'"
  },
  {
    table: 'pos_payment_allocations',
    column: 'payment_method',
    enumValues: POS_PAYMENT_ALLOCATIONS_ENUM,
    previousEnumValues: PREVIOUS_POS_PAYMENT_ALLOCATIONS_ENUM,
    defaultClause: ''
  }
];

const modifyEnumColumn = async (queryInterface, databaseName, { table, column, enumValues, defaultClause }) => {
  if (!(await tableExists(queryInterface, databaseName, table))) return;
  await queryInterface.sequelize.query(`
    ALTER TABLE ${quoteIdentifier(databaseName)}.${quoteIdentifier(table)}
    MODIFY COLUMN ${quoteIdentifier(column)} ENUM(${enumValues}) NOT NULL${defaultClause}
  `);
};

module.exports = {
  async up(queryInterface) {
    const currentDatabaseName = await getCurrentDatabaseName(queryInterface);
    if (!currentDatabaseName) return;
    const tenantDatabaseNames = await getActiveTenantDatabaseNames(queryInterface, currentDatabaseName);
    for (const databaseName of [...new Set([currentDatabaseName, ...tenantDatabaseNames])]) {
      for (const spec of WIDENED_COLUMNS) {
        await modifyEnumColumn(queryInterface, databaseName, spec);
      }
    }
  },

  async down(queryInterface) {
    const currentDatabaseName = await getCurrentDatabaseName(queryInterface);
    if (!currentDatabaseName) return;
    const tenantDatabaseNames = await getActiveTenantDatabaseNames(queryInterface, currentDatabaseName);
    for (const databaseName of [...new Set([currentDatabaseName, ...tenantDatabaseNames])]) {
      for (const spec of WIDENED_COLUMNS) {
        const { table, column, previousEnumValues, defaultClause } = spec;
        if (!(await tableExists(queryInterface, databaseName, table))) continue;
        const [rows] = await queryInterface.sequelize.query(
          `SELECT COUNT(*) AS count FROM ${quoteIdentifier(databaseName)}.${quoteIdentifier(table)} WHERE ${quoteIdentifier(column)} = 'cheque'`
        );
        if (Number(rows?.[0]?.count || 0) > 0) {
          // Loud failure over silent financial-data mutation -- same posture as the
          // grab_pay/shopeepay precedent. A tenant with recorded cheque tenders cannot roll back
          // this migration; the code revert alone (leaving the ENUM widened) is harmless and is
          // the correct rollback path in that case instead.
          throw new Error(`Cannot roll back cheque tender while ${databaseName}.${table} contains cheque rows`);
        }
        await queryInterface.sequelize.query(`
          ALTER TABLE ${quoteIdentifier(databaseName)}.${quoteIdentifier(table)}
          MODIFY COLUMN ${quoteIdentifier(column)} ENUM(${previousEnumValues}) NOT NULL${defaultClause}
        `);
      }
    }
  }
};
