'use strict';

// Phase 211 (#1180). Retail-only, additive "packed" fulfillment step. Two nullable, additive
// columns on the tenant table `pos_transactions` -- `packed_at`/`packed_by` -- attributing who
// marked an order packed and when (PHASE_211_PLAN.md section 3).
//
// `apps/dgfy-migration-runner` only ever connects to the landlord DB -- `pos_transactions` is
// tenant-scoped, so this migration fans out over every active tenant database itself, exactly
// like 20260901000002-add-order-rejection-reason-and-address-change-audit.cjs (the template this
// file mirrors verbatim in structure). Skipping the fan-out is the #860/#639 crash-loop class
// (docs/ops/TENANT_SCHEMA_SYNC_RESIDUAL_RISK_TRACKER.md). `apps/dgfy-api/scripts/sync-tenant-
// schemas.js` is kept in lockstep in the same commit (REQUIRED_TENANT_SCHEMA_COLUMNS.
// pos_transactions), so a tenant that misses this migration, or is restored from an older
// snapshot, self-repairs the two new columns at API boot.
//
// MYSQL ENUM CAVEAT (the single highest-risk item in this phase -- PHASE_211_PLAN.md section 3.1):
// `fulfillment_status` is a Sequelize DataTypes.ENUM, which is a real MySQL ENUM column. Widening
// the Sequelize model definition (PosTransaction.js) does NOT alter the physical column -- writing
// 'packed' to an un-widened MySQL ENUM either truncates to '' or errors under STRICT_TRANS_TABLES.
// This migration therefore ALSO issues a MODIFY COLUMN widening `pos_transactions.
// fulfillment_status` to include 'packed', inside the same tenant fan-out loop, guarded by reading
// the column's current definition from information_schema.columns.COLUMN_TYPE and skipping when
// 'packed' is already present. A missed ENUM widening here is the #860/#639 crash-loop class in a
// different costume: it would not crash-loop the API, but it would either silently drop the value
// to '' or throw a 500 on every attempted preparing -> packed PATCH, depending on sql_mode.
//
// rollback_note: the two new columns (`packed_at`/`packed_by`) are nullable and additive, so
// dropping them is pure at the schema level -- the only data loss on rollback is the packed_at/
// packed_by stamps themselves. The ENUM widening is DELIBERATELY NOT reverted by down() --
// narrowing an ENUM that may already hold 'packed' rows would be destructive (MySQL either
// rejects the MODIFY COLUMN under STRICT_TRANS_TABLES or silently truncates existing 'packed'
// rows to ''). This down() is therefore asymmetric by design, not an oversight.

const SAFE_IDENTIFIER_PATTERN = /^[A-Za-z0-9_-]+$/;
const POS_TRANSACTIONS_TABLE = 'pos_transactions';

const NEW_POS_TRANSACTION_COLUMNS = [
  { name: 'packed_at', ddl: 'DATETIME NULL AFTER `rejected_at`' },
  { name: 'packed_by', ddl: 'INT NULL' }
];

const PACKED_BY_FK_NAME = 'fk_pos_transactions_packed_by';
const FULFILLMENT_STATUS_COLUMN = 'fulfillment_status';
const FULFILLMENT_STATUS_NEW_VALUE = 'packed';
// Insert 'packed' immediately after 'preparing' when present, matching the ordering used in
// PosTransaction.js and posUseCases.js's ONLINE_FULFILLMENT_STATUSES -- purely cosmetic (MySQL
// ENUM ordinal position has no behavioral effect here, no ORDER BY relies on it), kept only for
// readability/consistency with the model definition.
const FULFILLMENT_STATUS_INSERT_AFTER = 'preparing';

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

const getColumnType = async (queryInterface, databaseName, tableName, columnName) => {
  const [rows] = await queryInterface.sequelize.query(
    'SELECT COLUMN_TYPE AS columnType, IS_NULLABLE AS isNullable, COLUMN_DEFAULT AS columnDefault ' +
    'FROM information_schema.columns WHERE table_schema = ? AND table_name = ? AND column_name = ?',
    { replacements: [databaseName, tableName, columnName] }
  );
  return rows?.[0] || null;
};

// Parses MySQL's `enum('a','b','c')` COLUMN_TYPE string into an ordered array of raw values.
const parseEnumValues = (columnType) => {
  const match = /^enum\((.*)\)$/i.exec(String(columnType || '').trim());
  if (!match) return null;
  const body = match[1];
  const values = [];
  // Values are single-quoted, with '' escaped as ''''; a simple split is unsafe for that escape,
  // so walk the string char-by-char.
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < body.length; i += 1) {
    const ch = body[i];
    if (inQuotes) {
      if (ch === "'" && body[i + 1] === "'") {
        current += "'";
        i += 1;
      } else if (ch === "'") {
        inQuotes = false;
      } else {
        current += ch;
      }
    } else if (ch === "'") {
      inQuotes = true;
    } else if (ch === ',') {
      values.push(current);
      current = '';
    }
    // commas/whitespace outside quotes are separators/ignorable
  }
  // The final value (or the only value, if there's no comma at all) never hits the comma branch
  // above, so it has to be flushed here.
  values.push(current);
  return values;
};

const buildEnumSqlLiteral = (values) => values
  .map((value) => `'${String(value).replace(/'/g, "''")}'`)
  .join(',');

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

      // 1. Two additive nullable columns.
      for (const { name, ddl } of NEW_POS_TRANSACTION_COLUMNS) {
        if (await columnExists(queryInterface, databaseName, POS_TRANSACTIONS_TABLE, name)) continue;
        await queryInterface.sequelize.query(`
          ALTER TABLE ${quoteIdentifier(databaseName)}.${quoteIdentifier(POS_TRANSACTIONS_TABLE)}
          ADD COLUMN ${quoteIdentifier(name)} ${ddl}
        `);
      }

      // 2. packed_by FK.
      if (
        (await tableExists(queryInterface, databaseName, 'users'))
        && !(await foreignKeyExists(queryInterface, databaseName, POS_TRANSACTIONS_TABLE, PACKED_BY_FK_NAME))
      ) {
        await queryInterface.sequelize.query(`
          ALTER TABLE ${quoteIdentifier(databaseName)}.${quoteIdentifier(POS_TRANSACTIONS_TABLE)}
          ADD CONSTRAINT ${quoteIdentifier(PACKED_BY_FK_NAME)}
          FOREIGN KEY (${quoteIdentifier('packed_by')}) REFERENCES ${quoteIdentifier(databaseName)}.${quoteIdentifier('users')} (${quoteIdentifier('user_id')}) ON DELETE SET NULL
        `);
      }

      // 3. MySQL ENUM widening -- see the file-header caveat. Read the column's *actual* current
      // definition rather than assuming it matches the Sequelize model, and skip entirely if
      // 'packed' is already present (idempotent / re-run safe).
      const columnInfo = await getColumnType(queryInterface, databaseName, POS_TRANSACTIONS_TABLE, FULFILLMENT_STATUS_COLUMN);
      if (!columnInfo) continue; // column missing entirely is out of scope for this migration
      const currentValues = parseEnumValues(columnInfo.columnType);
      if (!currentValues) continue; // defensive: column is not actually an ENUM (unexpected)
      if (currentValues.includes(FULFILLMENT_STATUS_NEW_VALUE)) continue; // already widened

      const insertAt = currentValues.indexOf(FULFILLMENT_STATUS_INSERT_AFTER);
      const nextValues = [...currentValues];
      if (insertAt === -1) {
        nextValues.push(FULFILLMENT_STATUS_NEW_VALUE);
      } else {
        nextValues.splice(insertAt + 1, 0, FULFILLMENT_STATUS_NEW_VALUE);
      }

      const nullableClause = String(columnInfo.isNullable || '').toUpperCase() === 'NO' ? 'NOT NULL' : 'NULL';
      const defaultClause = columnInfo.columnDefault === null
        ? (nullableClause === 'NULL' ? 'DEFAULT NULL' : '')
        : `DEFAULT '${String(columnInfo.columnDefault).replace(/'/g, "''")}'`;

      await queryInterface.sequelize.query(`
        ALTER TABLE ${quoteIdentifier(databaseName)}.${quoteIdentifier(POS_TRANSACTIONS_TABLE)}
        MODIFY COLUMN ${quoteIdentifier(FULFILLMENT_STATUS_COLUMN)} ENUM(${buildEnumSqlLiteral(nextValues)}) ${nullableClause} ${defaultClause}
      `);
    }
  },

  async down(queryInterface) {
    const currentDatabaseName = await getCurrentDatabaseName(queryInterface);
    if (!currentDatabaseName) return;
    const tenantDatabaseNames = await getActiveTenantDatabaseNames(queryInterface, currentDatabaseName);

    for (const databaseName of [...new Set([currentDatabaseName, ...tenantDatabaseNames])]) {
      if (!(await tableExists(queryInterface, databaseName, POS_TRANSACTIONS_TABLE))) continue;

      // Deliberately NOT reverting the fulfillment_status ENUM widening -- see rollback_note above.

      if (await foreignKeyExists(queryInterface, databaseName, POS_TRANSACTIONS_TABLE, PACKED_BY_FK_NAME)) {
        await queryInterface.sequelize.query(`
          ALTER TABLE ${quoteIdentifier(databaseName)}.${quoteIdentifier(POS_TRANSACTIONS_TABLE)}
          DROP FOREIGN KEY ${quoteIdentifier(PACKED_BY_FK_NAME)}
        `);
      }

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
