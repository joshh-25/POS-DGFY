'use strict';

// Phase 259 (#1490 + #1494, batched per #1496's "Wave 1 -- batch the migrations"). Three additive,
// nullable columns on `vouchers`:
//   - max_order_value_centavos (#1490): eligibility cap, mirrors min_spend_centavos's own shape.
//   - created_by / updated_by (#1494): accountable officer, no DB-level FK -- see this phase's plan
//     doc for why (cross-tenant-DB ALTER via this migration's landlord-only connection makes a
//     correctly-qualified FK unverified risk for a display-only column; sync-tenant-schemas.js's
//     column-presence-only repair gate would also permanently starve already-active tenants of the
//     constraint if this migration added the column without it). Employee.created_by/updated_by and
//     DeliveryPersonnel.created_by/updated_by already use this same bare-column, no-FK shape.
//
// All three are additive and nullable -- every existing voucher row stays byte-identical.
//
// `apps/dgfy-migration-runner` only ever connects to the landlord DB -- `vouchers` is tenant-scoped,
// so this migration fans out over every active tenant database itself, exactly as
// 20260905000002-add-voucher-auto-apply.cjs already does (same tenant-discovery query, same
// idempotence guards, same structural template, copied verbatim for the shared helpers below).
//
// rollback_note: dropping these three columns loses the order-value cap and the audit trail: no
// money column is touched and no persisted order/redemption is recomputed. Same safety profile as
// 20260905000002's own auto_apply rollback.
//
// `apps/dgfy-api/scripts/sync-tenant-schemas.js` is kept in lockstep in the SAME commit
// (REQUIRED_TENANT_SCHEMA_COLUMNS.vouchers.{max_order_value_centavos,created_by,updated_by}) --
// DDL strings must stay string-identical (enforced by
// tests/addVoucherOrderValueAndAuditColumns.migration.test.js). The REQUIRED_TENANT_SCHEMA_TABLES
// .vouchers CREATE TABLE fallback is deliberately NOT edited -- same precedent as pricelist_id /
// is_publicly_listed (sync-tenant-schemas.js:461-471): a purely additive nullable column with no
// enum-widening component is column-repair-only, the base CREATE TABLE string is only touched when
// an ENUM actually needs widening (as Phase 240 did for benefit_target/voucher_kind).

const SAFE_IDENTIFIER_PATTERN = /^[A-Za-z0-9_-]+$/;

const VOUCHERS_TABLE = 'vouchers';
const NEW_COLUMNS = [
  { name: 'max_order_value_centavos', ddl: 'BIGINT NULL DEFAULT NULL' },
  { name: 'created_by', ddl: 'INT NULL DEFAULT NULL' },
  { name: 'updated_by', ddl: 'INT NULL DEFAULT NULL' }
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

module.exports = {
  async up(queryInterface) {
    const currentDatabaseName = await getCurrentDatabaseName(queryInterface);
    if (!currentDatabaseName) return;
    const tenantDatabaseNames = await getActiveTenantDatabaseNames(queryInterface, currentDatabaseName);

    for (const databaseName of [...new Set([currentDatabaseName, ...tenantDatabaseNames])]) {
      if (!(await tableExists(queryInterface, databaseName, VOUCHERS_TABLE))) continue;
      for (const column of NEW_COLUMNS) {
        await addColumnIfMissing(queryInterface, databaseName, VOUCHERS_TABLE, column);
      }
    }
  },

  async down(queryInterface) {
    const currentDatabaseName = await getCurrentDatabaseName(queryInterface);
    if (!currentDatabaseName) return;
    const tenantDatabaseNames = await getActiveTenantDatabaseNames(queryInterface, currentDatabaseName);

    for (const databaseName of [...new Set([currentDatabaseName, ...tenantDatabaseNames])]) {
      if (!(await tableExists(queryInterface, databaseName, VOUCHERS_TABLE))) continue;
      for (const column of [...NEW_COLUMNS].reverse()) {
        await dropColumnIfPresent(queryInterface, databaseName, VOUCHERS_TABLE, column);
      }
    }
  }
};
