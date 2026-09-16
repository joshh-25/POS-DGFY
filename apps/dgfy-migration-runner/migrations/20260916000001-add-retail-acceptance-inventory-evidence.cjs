'use strict';

// #1931. Two nullable, additive evidence columns on `pos_transactions` so Retail's
// accept-time goods-issue is recorded exactly once and reversed at most once:
//
// - `inventory_issued_at` -- set exactly once, at whichever checkpoint actually performs
//   the goods-issue for this order (accept-time for Retail post-deploy; completion-time
//   for every other mode, and for Retail orders accepted before this change deployed).
//   Never cleared. Legacy rows stay NULL and keep the unchanged completion-time path.
// - `inventory_reversed_at` -- set exactly once, when a post-acceptance cancel/reject
//   reverses a prior goods-issue. Never cleared.
//
// `pos_transactions` is tenant-scoped, so this migration fans out over the connected landlord
// database and every active tenant database. The tenant-schema-sync registry
// (apps/dgfy-api/scripts/sync-tenant-schemas.js) is updated in the same change for restored
// or newly-created tenants.
//
// rollback_note: dropping these two nullable evidence columns is pure at the schema level,
// but it ORPHANS the evidence itself -- a Retail order accepted while the columns existed
// would read as "never issued" afterward and re-issue at completion (double deduction
// against the already-reversed stock). Do not roll back while post-deploy Retail orders
// exist in `confirmed` or later with these columns set; the only data loss on rollback is
// the evidence timestamps themselves.

const SAFE_IDENTIFIER_PATTERN = /^[A-Za-z0-9_-]+$/;
const POS_TRANSACTIONS_TABLE = 'pos_transactions';
const COLUMN_NAMES = ['inventory_issued_at', 'inventory_reversed_at'];

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
    "SELECT DISTINCT db_name FROM tenants WHERE status = 'active' AND db_name IS NOT NULL AND db_name <> ''"
  );
  return rows.map((row) => String(row?.db_name || '').trim()).filter(Boolean);
};

const columnDefinition = (columnName) => {
  if (columnName === 'inventory_issued_at') {
    return 'DATETIME NULL COMMENT \'Retail accept-time (or legacy completion-time) goods-issue evidence; set once, never cleared\'';
  }
  return 'DATETIME NULL COMMENT \'Post-acceptance cancel/reject reversal evidence; set once, never cleared\'';
};

module.exports = {
  async up(queryInterface) {
    const currentDatabaseName = await getCurrentDatabaseName(queryInterface);
    if (!currentDatabaseName) return;
    const tenantDatabaseNames = await getActiveTenantDatabaseNames(queryInterface, currentDatabaseName);

    for (const databaseName of [...new Set([currentDatabaseName, ...tenantDatabaseNames])]) {
      if (!(await tableExists(queryInterface, databaseName, POS_TRANSACTIONS_TABLE))) continue;
      for (const columnName of COLUMN_NAMES) {
        if (await columnExists(queryInterface, databaseName, POS_TRANSACTIONS_TABLE, columnName)) continue;

        await queryInterface.sequelize.query(`
          ALTER TABLE ${quoteIdentifier(databaseName)}.${quoteIdentifier(POS_TRANSACTIONS_TABLE)}
          ADD COLUMN ${quoteIdentifier(columnName)} ${columnDefinition(columnName)}
        `);
      }
    }
  },

  async down(queryInterface) {
    const currentDatabaseName = await getCurrentDatabaseName(queryInterface);
    if (!currentDatabaseName) return;
    const tenantDatabaseNames = await getActiveTenantDatabaseNames(queryInterface, currentDatabaseName);

    for (const databaseName of [...new Set([currentDatabaseName, ...tenantDatabaseNames])]) {
      if (!(await tableExists(queryInterface, databaseName, POS_TRANSACTIONS_TABLE))) continue;
      for (const columnName of COLUMN_NAMES) {
        if (!(await columnExists(queryInterface, databaseName, POS_TRANSACTIONS_TABLE, columnName))) continue;

        await queryInterface.sequelize.query(`
          ALTER TABLE ${quoteIdentifier(databaseName)}.${quoteIdentifier(POS_TRANSACTIONS_TABLE)}
          DROP COLUMN ${quoteIdentifier(columnName)}
        `);
      }
    }
  }
};
