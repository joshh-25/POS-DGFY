'use strict';

// Phase 244 (#1332, epic #1321 decision 9). Auto-applied free-delivery campaigns.
//
// One additive column on `vouchers` -- `auto_apply` (TINYINT(1) NOT NULL DEFAULT 0) -- plus one
// composite index covering the auto-apply candidate query
// (voucherRepository.js's `listAutoApplyDeliveryCampaigns`). `0`/false means "code-entered only,"
// which is exactly what every pre-Phase-244 voucher already is -- every existing row stays
// byte-identical.
//
// NOT NULL with an explicit default is required by ADR 0066 Decision 10: "eligible everywhere
// cannot be produced by omission" (the #459 failure mode) -- a nullable `auto_apply` would let a
// voucher's auto-apply-ness be ambiguous by omission, the same class of hazard that decision guards
// against for the four eligibility bitmasks.
//
// `apps/dgfy-migration-runner` only ever connects to the landlord DB -- `vouchers` is tenant-scoped,
// so this migration fans out over every active tenant database itself, exactly as
// 20260904000001-add-delivery-voucher-benefit.cjs already does (same tenant-discovery query, same
// idempotence guards). Structural template: that same file, copied verbatim for the shared helpers.
//
// UNLIKE that migration, this one has NO ENUM widening -- `down()` is a clean, guarded index-drop
// then column-drop, both fully reversible with no data-loss beyond the auto-apply flag itself.
// rollback_note: dropping `auto_apply` reverts every campaign to code-entered-only; no money column
// is touched and no persisted order is recomputed. This is a materially safer rollback profile than
// Phase 240's own migration (see this repo's compliance declaration for Phase 244).
//
// `apps/dgfy-api/scripts/sync-tenant-schemas.js` is kept in lockstep in the SAME commit
// (REQUIRED_TENANT_SCHEMA_COLUMNS.vouchers.auto_apply, REQUIRED_TENANT_SCHEMA_INDEXES.vouchers
// .idx_vouchers_auto_apply, AND the REQUIRED_TENANT_SCHEMA_TABLES.vouchers CREATE TABLE fallback --
// see that file's own comments), so a tenant that misses this migration, or is restored from an
// older snapshot, self-repairs at API boot -- the #860/#639 crash-loop-prevention mechanism.

const SAFE_IDENTIFIER_PATTERN = /^[A-Za-z0-9_-]+$/;

const VOUCHERS_TABLE = 'vouchers';
const AUTO_APPLY_COLUMN = { name: 'auto_apply', ddl: 'TINYINT(1) NOT NULL DEFAULT 0' };
const AUTO_APPLY_INDEX_NAME = 'idx_vouchers_auto_apply';
const AUTO_APPLY_INDEX_COLUMNS = ['auto_apply', 'status', 'benefit_target'];

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

// No equivalent helper existed in the Phase 240 template (its migration added no index) -- same
// information_schema query shape as tableExists/columnExists above, just against .statistics.
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

const addColumnIfMissing = async (queryInterface, databaseName, tableName, { name, ddl }) => {
  if (await columnExists(queryInterface, databaseName, tableName, name)) return;
  await queryInterface.sequelize.query(`
    ALTER TABLE ${quoteIdentifier(databaseName)}.${quoteIdentifier(tableName)}
    ADD COLUMN ${quoteIdentifier(name)} ${ddl}
  `);
};

const dropColumnIfPresent = async (queryInterface, databaseName, tableName, { name }) => {
  if (!(await columnExists(queryInterface, databaseName, tableName, name))) return;
  await queryInterface.sequelize.query(`
    ALTER TABLE ${quoteIdentifier(databaseName)}.${quoteIdentifier(tableName)}
    DROP COLUMN ${quoteIdentifier(name)}
  `);
};

const addIndexIfMissing = async (queryInterface, databaseName, tableName, indexName, columns) => {
  if (await indexExists(queryInterface, databaseName, tableName, indexName)) return;
  const columnList = columns.map((column) => quoteIdentifier(column)).join(',');
  await queryInterface.sequelize.query(`
    ALTER TABLE ${quoteIdentifier(databaseName)}.${quoteIdentifier(tableName)}
    ADD INDEX ${quoteIdentifier(indexName)} (${columnList})
  `);
};

const dropIndexIfPresent = async (queryInterface, databaseName, tableName, indexName) => {
  if (!(await indexExists(queryInterface, databaseName, tableName, indexName))) return;
  await queryInterface.sequelize.query(`
    ALTER TABLE ${quoteIdentifier(databaseName)}.${quoteIdentifier(tableName)}
    DROP INDEX ${quoteIdentifier(indexName)}
  `);
};

module.exports = {
  async up(queryInterface) {
    const currentDatabaseName = await getCurrentDatabaseName(queryInterface);
    if (!currentDatabaseName) return;
    const tenantDatabaseNames = await getActiveTenantDatabaseNames(queryInterface, currentDatabaseName);

    for (const databaseName of [...new Set([currentDatabaseName, ...tenantDatabaseNames])]) {
      if (!(await tableExists(queryInterface, databaseName, VOUCHERS_TABLE))) continue;

      await addColumnIfMissing(queryInterface, databaseName, VOUCHERS_TABLE, AUTO_APPLY_COLUMN);
      // Index added AFTER the column -- MySQL cannot index a column that doesn't exist yet, and this
      // keeps the same "structural change, then repair" ordering the sibling migration already uses.
      await addIndexIfMissing(queryInterface, databaseName, VOUCHERS_TABLE, AUTO_APPLY_INDEX_NAME, AUTO_APPLY_INDEX_COLUMNS);
    }
  },

  async down(queryInterface) {
    const currentDatabaseName = await getCurrentDatabaseName(queryInterface);
    if (!currentDatabaseName) return;
    const tenantDatabaseNames = await getActiveTenantDatabaseNames(queryInterface, currentDatabaseName);

    for (const databaseName of [...new Set([currentDatabaseName, ...tenantDatabaseNames])]) {
      if (!(await tableExists(queryInterface, databaseName, VOUCHERS_TABLE))) continue;

      // Index dropped BEFORE the column -- a still-present index over a dropped column is invalid;
      // dropping the index first costs nothing and avoids relying on MySQL's own implicit index-drop
      // behavior on DROP COLUMN (which does not apply here anyway, since the index is composite and
      // covers columns beyond auto_apply).
      await dropIndexIfPresent(queryInterface, databaseName, VOUCHERS_TABLE, AUTO_APPLY_INDEX_NAME);
      await dropColumnIfPresent(queryInterface, databaseName, VOUCHERS_TABLE, AUTO_APPLY_COLUMN);
    }
  }
};
