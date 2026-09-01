'use strict';

// Phase 237 (#1329, epic #1321). Five additive, nullable-or-defaulted columns on the tenant table
// `pos_transactions` -- delivery-fee money-provenance columns (mode/base/waiver/override/calc
// version) captured on every storefront checkout, feeding the ADR 0012 amendment dated 2026-09-02.
// See docs/compliance/impact-declarations/2026-09-02-storefront-calculated-and-free-delivery-fee-modes.md
// for the full compliance writeup.
//
// `apps/dgfy-migration-runner` only ever connects to the landlord DB -- `pos_transactions` is
// tenant-scoped, so this migration fans out over every active tenant database itself, mirroring
// 20260902000001-add-delivery-distance-capture.cjs (the Phase 236 template this file's structure is
// based on) exactly: same tenant-discovery query, same idempotence guards, same additive/reversible
// shape.
// `apps/dgfy-api/scripts/sync-tenant-schemas.js` is kept in lockstep in the SAME commit
// (REQUIRED_TENANT_SCHEMA_COLUMNS.pos_transactions), so a tenant that misses this migration, or is
// restored from an older snapshot, self-repairs the five new columns at API boot -- the #860/#639
// crash-loop-prevention mechanism.
//
// rollback_note: all five columns are additive and nullable/defaulted, and read by nothing else in
// this diff -- dropping them is pure at the schema level. Orders already persisted at a calculated
// fee are NOT recomputed by a revert -- the fee they carry stays correct for the money that was
// actually collected; only the provenance columns become unreadable after a rollback. Reverting the
// commit set restores the pre-237 flat-rate resolver exactly (resolveDeliveryFeeConfig's output was
// already being computed-and-discarded before this phase, per the ADR 0012 amendment).

const SAFE_IDENTIFIER_PATTERN = /^[A-Za-z0-9_-]+$/;
const POS_TRANSACTIONS_TABLE = 'pos_transactions';

const NEW_POS_TRANSACTION_COLUMNS = [
  { name: 'delivery_fee_mode', ddl: "ENUM('fixed','calculated','free') NOT NULL DEFAULT 'fixed' AFTER `delivery_distance_source`" },
  { name: 'delivery_fee_base', ddl: 'DECIMAL(14,4) NOT NULL DEFAULT 0' },
  { name: 'delivery_fee_waiver', ddl: 'DECIMAL(14,4) NOT NULL DEFAULT 0' },
  // Nullable is load-bearing: NULL = no override, 0.0000 = staff set it free. See the model comment
  // on PosTransaction.js's delivery_fee_override field for the full rationale.
  { name: 'delivery_fee_override', ddl: 'DECIMAL(14,4) NULL DEFAULT NULL' },
  { name: 'delivery_fee_calc_version', ddl: 'SMALLINT UNSIGNED NOT NULL DEFAULT 1' }
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
