'use strict';

// Phase 236 (#1328, epic #1321). Observation-only server-side road-distance capture. Two additive
// nullable/defaulted columns on the tenant table `pos_transactions` -- `delivery_distance_meters`
// and `delivery_distance_source` -- capturing whatever the new roadDistanceProvider adapter
// resolved at checkout. Neither column feeds delivery-fee math anywhere in this codebase; see
// docs/compliance/impact-declarations/2026-09-02-server-side-road-distance-capture-observation-only.md
// for the full compliance/fee-boundary writeup.
//
// `apps/dgfy-migration-runner` only ever connects to the landlord DB -- `pos_transactions` is
// tenant-scoped, so this migration fans out over every active tenant database itself, mirroring
// 20260901000003-add-order-packed-attribution.cjs (the template this file's structure is based on)
// minus that migration's ENUM-widening step, which does not apply here: both new columns are
// brand-new, so there is no existing MySQL ENUM to widen.
// `apps/dgfy-api/scripts/sync-tenant-schemas.js` is kept in lockstep in the same commit
// (REQUIRED_TENANT_SCHEMA_COLUMNS.pos_transactions), so a tenant that misses this migration, or is
// restored from an older snapshot, self-repairs the two new columns at API boot -- the #860/#639
// crash-loop-prevention mechanism.
//
// rollback_note: both new columns are nullable/defaulted and additive, and read by nothing else in
// this diff -- dropping them is pure at the schema level. The only data loss on rollback is the
// captured distance/source values themselves, never a fee-math value (delivery_fee/total_amount
// are computed with no dependency on either column).

const SAFE_IDENTIFIER_PATTERN = /^[A-Za-z0-9_-]+$/;
const POS_TRANSACTIONS_TABLE = 'pos_transactions';

const NEW_POS_TRANSACTION_COLUMNS = [
  { name: 'delivery_distance_meters', ddl: 'INT NULL AFTER `outside_radius_flag`' },
  { name: 'delivery_distance_source', ddl: "ENUM('road','fallback','none') NOT NULL DEFAULT 'none'" }
];

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

module.exports = {
  async up(queryInterface) {
    const currentDatabaseName = await getCurrentDatabaseName(queryInterface);
    if (!currentDatabaseName) return;
    const tenantDatabaseNames = await getActiveTenantDatabaseNames(queryInterface, currentDatabaseName);

    for (const databaseName of [...new Set([currentDatabaseName, ...tenantDatabaseNames])]) {
      if (!(await tableExists(queryInterface, databaseName, POS_TRANSACTIONS_TABLE))) continue;

      for (const { name, ddl } of NEW_POS_TRANSACTION_COLUMNS) {
        if (await columnExists(queryInterface, databaseName, POS_TRANSACTIONS_TABLE, name)) continue;
        await queryInterface.sequelize.query(`
          ALTER TABLE ${quoteIdentifier(databaseName)}.${quoteIdentifier(POS_TRANSACTIONS_TABLE)}
          ADD COLUMN ${quoteIdentifier(name)} ${ddl}
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

      for (const { name } of NEW_POS_TRANSACTION_COLUMNS) {
        if (!(await columnExists(queryInterface, databaseName, POS_TRANSACTIONS_TABLE, name))) continue;
        await queryInterface.sequelize.query(`
          ALTER TABLE ${quoteIdentifier(databaseName)}.${quoteIdentifier(POS_TRANSACTIONS_TABLE)}
          DROP COLUMN ${quoteIdentifier(name)}
        `);
      }
    }
  }
};
