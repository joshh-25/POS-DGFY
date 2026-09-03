'use strict';

// Phase 269 (#788) -- account-restricted voucher issuance. Three changes, all tenant-scoped:
//
//   1. NEW TABLE `voucher_account_grants` -- the allowlist of DGFY accounts permitted to redeem a
//      restricted voucher. Structurally a twin of `voucher_scopes` (int PK, CASCADE FK to
//      `vouchers`, one composite unique key, created_at only). `dgfy_account_id` is CHAR(36) with
//      NO foreign key: `dgfy_accounts` lives in the LANDLORD database while `vouchers` is
//      tenant-scoped, so the reference is not expressible as an FK (ADR 0052) -- exactly the same
//      posture `store_customers.dgfy_account_id` and `voucher_redemptions.dgfy_account_id` already
//      take.
//   2. NEW COLUMN `vouchers.is_account_restricted` -- NOT NULL DEFAULT 0. Derived server-side from
//      the grant rows and written in the same transaction as them (voucherUseCases.js), never by a
//      client. NOT NULL with a false default rather than nullable, so "unrestricted" can never be
//      produced by a NULL nobody wrote -- the same invariant ADR 0066 decision 10 binds for the
//      four eligibility masks.
//   3. NEW INDEX `voucher_redemptions.idx_voucher_redemptions_account` on
//      (`dgfy_account_id`, `voucher_id`) -- the per-account audit read this phase makes possible
//      for the first time by actually populating that column, and the index #606 (per-customer
//      voucher limits) will need unchanged.
//   4. RETYPE `voucher_redemptions.dgfy_account_id` INT -> CHAR(36). This is a latent-bug repair,
//      not a feature: `DgfyAccount.id` has always been a UUID, so the original INT declaration
//      (#455/Phase 102) could never have held a real account id. Verified before writing this
//      migration that NOTHING in the repository has ever written that column -- `createRedemption
//      LedgerEntry` never passed it -- so every existing row is NULL and the MODIFY is lossless on
//      real data. Phase 269 is its first writer.
//
// `apps/dgfy-migration-runner` only ever connects to the landlord DB, and all three targets are
// tenant-scoped, so this migration fans out over every active tenant database itself -- same
// tenant-discovery query, same idempotence guards, same structural template as
// 20260906000002-add-voucher-order-value-and-audit-columns.cjs, copied verbatim for the shared
// helpers below.
//
// Change 4 is the one that is NOT presence-idempotent the way an ADD COLUMN is, so it carries its
// own guard: the MODIFY is skipped unless the column's current data type is still `int`. That makes
// a re-run a no-op rather than a redundant table rebuild, and -- more importantly -- makes this
// migration safe on a tenant provisioned by `sequelize.sync()` AFTER this ships, whose column is
// already CHAR(36) from the model.
//
// rollback_note: down() drops the new table and column and returns the ledger column to INT. The
// INT restore is destructive IF any redemption has been recorded with a real account id since this
// shipped -- those values cannot fit an INT and become 0/NULL. That is the only lossy step here and
// it is called out rather than buried: `voucher_account_grants` rows and `is_account_restricted`
// are pure feature state (dropping them restores every voucher to unrestricted, i.e. pre-#788
// behaviour), and no money column, discount computation, or persisted order/redemption amount is
// touched by any of the three.
//
// `apps/dgfy-api/scripts/sync-tenant-schemas.js` is kept in lockstep in the SAME commit
// (REQUIRED_TENANT_SCHEMA_TABLES.voucher_account_grants,
// REQUIRED_TENANT_SCHEMA_COLUMNS.vouchers.is_account_restricted, and
// REQUIRED_TENANT_SCHEMA_INDEXES.voucher_redemptions.idx_voucher_redemptions_account) -- DDL
// strings must stay string-identical, enforced by
// tests/addVoucherAccountRestriction.migration.test.js. The retype in
// change 4 has no equivalent repair entry, because that registry's repair pass is column-PRESENCE
// based only and has no notion of a type mismatch on an already-present column (the same
// documented limitation the ENUM-widening note in sync-tenant-schemas.js already records). A tenant
// that somehow misses this migration therefore keeps an INT column -- which is exactly its
// pre-#788 state, and the storefront write would fail loudly on it rather than silently mis-record
// an account.

const SAFE_IDENTIFIER_PATTERN = /^[A-Za-z0-9_-]+$/;

const VOUCHERS_TABLE = 'vouchers';
const REDEMPTIONS_TABLE = 'voucher_redemptions';
const GRANTS_TABLE = 'voucher_account_grants';

const NEW_COLUMNS = [
  { name: 'is_account_restricted', ddl: 'TINYINT(1) NOT NULL DEFAULT 0' }
];

const REDEMPTION_ACCOUNT_INDEX = {
  name: 'idx_voucher_redemptions_account',
  columns: '(`dgfy_account_id`,`voucher_id`)'
};

// Kept string-identical to REQUIRED_TENANT_SCHEMA_TABLES.voucher_account_grants.sql in
// apps/dgfy-api/scripts/sync-tenant-schemas.js, minus the leading `CREATE TABLE <name> (` and the
// trailing engine clause, both of which are assembled per-database below.
const GRANTS_TABLE_BODY = [
  '  `voucher_account_grant_id` int NOT NULL AUTO_INCREMENT',
  '  `voucher_id` int NOT NULL',
  '  `dgfy_account_id` char(36) NOT NULL',
  '  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP',
  '  PRIMARY KEY (`voucher_account_grant_id`)',
  '  UNIQUE KEY `uq_voucher_account_grants_voucher_account` (`voucher_id`,`dgfy_account_id`)',
  '  KEY `idx_voucher_account_grants_account` (`dgfy_account_id`)',
  '  CONSTRAINT `voucher_account_grants_ibfk_1` FOREIGN KEY (`voucher_id`) REFERENCES `vouchers` (`voucher_id`) ON DELETE CASCADE'
].join(',\n');

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

// Reads DATA_TYPE (`int` / `char`), not COLUMN_TYPE (`int(11)` / `char(36)`) -- MySQL 8 dropped the
// display width from COLUMN_TYPE for integers, so matching on the narrower DATA_TYPE is stable
// across both 5.7 and 8.x rather than depending on which one the server happens to report.
const getColumnDataType = async (queryInterface, databaseName, tableName, columnName) => {
  const [rows] = await queryInterface.sequelize.query(
    'SELECT DATA_TYPE AS dataType FROM information_schema.columns WHERE table_schema = ? AND table_name = ? AND column_name = ?',
    { replacements: [databaseName, tableName, columnName] }
  );
  return String(rows?.[0]?.dataType || '').toLowerCase() || null;
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

const indexExists = async (queryInterface, databaseName, tableName, indexName) => {
  const [rows] = await queryInterface.sequelize.query(
    'SELECT COUNT(*) AS count FROM information_schema.statistics WHERE table_schema = ? AND table_name = ? AND index_name = ?',
    { replacements: [databaseName, tableName, indexName] }
  );
  return Number(rows?.[0]?.count || 0) > 0;
};

const addRedemptionAccountIndexIfMissing = async (queryInterface, databaseName) => {
  if (!(await tableExists(queryInterface, databaseName, REDEMPTIONS_TABLE))) return;
  if (await indexExists(queryInterface, databaseName, REDEMPTIONS_TABLE, REDEMPTION_ACCOUNT_INDEX.name)) return;
  await queryInterface.sequelize.query(`
    ALTER TABLE ${quoteIdentifier(databaseName)}.${quoteIdentifier(REDEMPTIONS_TABLE)}
    ADD INDEX ${quoteIdentifier(REDEMPTION_ACCOUNT_INDEX.name)} ${REDEMPTION_ACCOUNT_INDEX.columns}
  `);
};

const dropRedemptionAccountIndexIfPresent = async (queryInterface, databaseName) => {
  if (!(await tableExists(queryInterface, databaseName, REDEMPTIONS_TABLE))) return;
  if (!(await indexExists(queryInterface, databaseName, REDEMPTIONS_TABLE, REDEMPTION_ACCOUNT_INDEX.name))) return;
  await queryInterface.sequelize.query(`
    ALTER TABLE ${quoteIdentifier(databaseName)}.${quoteIdentifier(REDEMPTIONS_TABLE)}
    DROP INDEX ${quoteIdentifier(REDEMPTION_ACCOUNT_INDEX.name)}
  `);
};

const createGrantsTableIfMissing = async (queryInterface, databaseName) => {
  if (await tableExists(queryInterface, databaseName, GRANTS_TABLE)) return;
  await queryInterface.sequelize.query(
    `CREATE TABLE ${quoteIdentifier(databaseName)}.${quoteIdentifier(GRANTS_TABLE)} (\n${GRANTS_TABLE_BODY}\n) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci`
  );
};

const dropGrantsTableIfPresent = async (queryInterface, databaseName) => {
  if (!(await tableExists(queryInterface, databaseName, GRANTS_TABLE))) return;
  await queryInterface.sequelize.query(
    `DROP TABLE ${quoteIdentifier(databaseName)}.${quoteIdentifier(GRANTS_TABLE)}`
  );
};

// Guarded on the CURRENT data type rather than on a migration marker, so this is idempotent in both
// directions and safe on a tenant whose column is already the target type (a tenant provisioned by
// sequelize.sync() after this ships gets CHAR(36) straight from the model, never having been INT).
const retypeRedemptionAccountColumn = async (queryInterface, databaseName, { from, ddl }) => {
  if (!(await tableExists(queryInterface, databaseName, REDEMPTIONS_TABLE))) return;
  if (!(await columnExists(queryInterface, databaseName, REDEMPTIONS_TABLE, 'dgfy_account_id'))) return;
  const currentType = await getColumnDataType(queryInterface, databaseName, REDEMPTIONS_TABLE, 'dgfy_account_id');
  if (currentType !== from) return;
  await queryInterface.sequelize.query(`
    ALTER TABLE ${quoteIdentifier(databaseName)}.${quoteIdentifier(REDEMPTIONS_TABLE)}
    MODIFY COLUMN ${quoteIdentifier('dgfy_account_id')} ${ddl}
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
      // After the column, because the FK below targets `vouchers` -- which must exist (guarded
      // above) but is otherwise unaffected by the ordering.
      await createGrantsTableIfMissing(queryInterface, databaseName);
      // Retype BEFORE the index: adding the index first would build it over an INT column and
      // force MySQL to rebuild it again on the MODIFY, for no benefit.
      await retypeRedemptionAccountColumn(queryInterface, databaseName, {
        from: 'int',
        ddl: 'CHAR(36) NULL DEFAULT NULL'
      });
      await addRedemptionAccountIndexIfMissing(queryInterface, databaseName);
    }
  },

  async down(queryInterface) {
    const currentDatabaseName = await getCurrentDatabaseName(queryInterface);
    if (!currentDatabaseName) return;
    const tenantDatabaseNames = await getActiveTenantDatabaseNames(queryInterface, currentDatabaseName);

    for (const databaseName of [...new Set([currentDatabaseName, ...tenantDatabaseNames])]) {
      if (!(await tableExists(queryInterface, databaseName, VOUCHERS_TABLE))) continue;
      // Exact reverse of up(): index, then retype, then the table, then the column. Dropping the
      // index first matters -- MySQL will not narrow an indexed CHAR(36) to INT while a key still
      // covers it.
      await dropRedemptionAccountIndexIfPresent(queryInterface, databaseName);
      await retypeRedemptionAccountColumn(queryInterface, databaseName, {
        from: 'char',
        ddl: 'INT NULL DEFAULT NULL'
      });
      await dropGrantsTableIfPresent(queryInterface, databaseName);
      for (const column of [...NEW_COLUMNS].reverse()) {
        await dropColumnIfPresent(queryInterface, databaseName, VOUCHERS_TABLE, column);
      }
    }
  }
};
