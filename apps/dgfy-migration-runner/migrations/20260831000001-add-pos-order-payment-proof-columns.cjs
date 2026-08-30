'use strict';

// Phase 204 (#965). Adds six nullable, additive columns to `pos_order_payments` for an optional
// proof-of-payment image on a merchant-owned 'balance' settlement (PHASE_204_PLAN.md section 5.1).
// `pos_order_payments` is a TENANT table -- apps/dgfy-migration-runner only ever connects to the
// landlord DB (this app's own README, line 8) -- so this migration must fan out over every active
// tenant database itself, exactly like 20260830000003-add-cheque-payment-method.cjs does, and
// NOT like the bare-queryInterface shape of 20260821000002-add-pos-transaction-partial-payment-
// columns.cjs, which only touches the connected DB. Skipping the fan-out is the #860/#639
// crash-loop class this repo has already had once (docs/ops/TENANT_SCHEMA_SYNC_RESIDUAL_RISK_
// TRACKER.md). `apps/dgfy-api/scripts/sync-tenant-schemas.js` is kept in lockstep in the same
// commit (REQUIRED_TENANT_SCHEMA_COLUMNS.pos_order_payments + REQUIRED_TENANT_SCHEMA_TABLES.
// pos_order_payments.sql), so a tenant that misses this migration or is restored from an older
// snapshot self-repairs at API boot, and a brand-new tenant is created correct.
//
// rollback_note: every column here is nullable and additive, so `down()` is pure at the schema
// level -- but it ORPHANS any proof files already written to
// apps/dgfy-api/storage/pos-payment-proofs/ on disk. Those files are not tracked by this migration
// and are not cleaned up by `down()`; removing them (if ever required) is a manual, out-of-band
// operation. Stated per PHASE_204_PLAN.md section 5.2.

const SAFE_IDENTIFIER_PATTERN = /^[A-Za-z0-9_-]+$/;
const TABLE = 'pos_order_payments';

const NEW_COLUMNS = [
  { name: 'proof_file_path', ddl: 'VARCHAR(255) NULL' },
  { name: 'proof_mime_type', ddl: 'VARCHAR(60) NULL' },
  { name: 'proof_file_size_bytes', ddl: 'INT NULL' },
  { name: 'proof_sha256', ddl: 'CHAR(64) NULL' },
  { name: 'proof_attached_at', ddl: 'DATETIME NULL' },
  // Staff attribution for the attach action, FK'd below -- mirrors `recorded_by`'s own FK.
  { name: 'proof_attached_by', ddl: 'INT NULL' }
];

const PROOF_ATTACHED_BY_FK_NAME = 'fk_pos_order_payments_proof_attached_by';

const foreignKeyExists = async (queryInterface, databaseName, tableName, constraintName) => {
  const [rows] = await queryInterface.sequelize.query(
    `SELECT COUNT(*) AS count FROM information_schema.table_constraints
     WHERE table_schema = ? AND table_name = ? AND constraint_name = ? AND constraint_type = 'FOREIGN KEY'`,
    { replacements: [databaseName, tableName, constraintName] }
  );
  return Number(rows?.[0]?.count || 0) > 0;
};

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
      // Both a re-run and a tenant restored from a snapshot that predates `pos_order_payments`
      // itself are no-ops here -- REQUIRED_TENANT_SCHEMA_TABLES' CREATE TABLE repair path handles
      // the latter case at API boot.
      if (!(await tableExists(queryInterface, databaseName, TABLE))) continue;

      for (const { name, ddl } of NEW_COLUMNS) {
        if (await columnExists(queryInterface, databaseName, TABLE, name)) continue;
        await queryInterface.sequelize.query(`
          ALTER TABLE ${quoteIdentifier(databaseName)}.${quoteIdentifier(TABLE)}
          ADD COLUMN ${quoteIdentifier(name)} ${ddl}
        `);
      }

      if (
        (await tableExists(queryInterface, databaseName, 'users'))
        && !(await foreignKeyExists(queryInterface, databaseName, TABLE, PROOF_ATTACHED_BY_FK_NAME))
      ) {
        await queryInterface.sequelize.query(`
          ALTER TABLE ${quoteIdentifier(databaseName)}.${quoteIdentifier(TABLE)}
          ADD CONSTRAINT ${quoteIdentifier(PROOF_ATTACHED_BY_FK_NAME)}
          FOREIGN KEY (${quoteIdentifier('proof_attached_by')}) REFERENCES ${quoteIdentifier(databaseName)}.${quoteIdentifier('users')} (${quoteIdentifier('user_id')}) ON DELETE SET NULL
        `);
      }
    }
  },

  async down(queryInterface) {
    const currentDatabaseName = await getCurrentDatabaseName(queryInterface);
    if (!currentDatabaseName) return;
    const tenantDatabaseNames = await getActiveTenantDatabaseNames(queryInterface, currentDatabaseName);

    for (const databaseName of [...new Set([currentDatabaseName, ...tenantDatabaseNames])]) {
      if (!(await tableExists(queryInterface, databaseName, TABLE))) continue;

      if (await foreignKeyExists(queryInterface, databaseName, TABLE, PROOF_ATTACHED_BY_FK_NAME)) {
        await queryInterface.sequelize.query(`
          ALTER TABLE ${quoteIdentifier(databaseName)}.${quoteIdentifier(TABLE)}
          DROP FOREIGN KEY ${quoteIdentifier(PROOF_ATTACHED_BY_FK_NAME)}
        `);
      }

      for (const { name } of NEW_COLUMNS) {
        if (!(await columnExists(queryInterface, databaseName, TABLE, name))) continue;
        await queryInterface.sequelize.query(`
          ALTER TABLE ${quoteIdentifier(databaseName)}.${quoteIdentifier(TABLE)}
          DROP COLUMN ${quoteIdentifier(name)}
        `);
      }
    }
  }
};
