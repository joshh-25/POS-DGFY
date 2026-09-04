'use strict';

// #1565 (#478 residue). Retires the legacy haversine `outside_radius_flag` column on
// `pos_transactions`. Confirmed write-only with zero consumers anywhere in the backend or any of
// the three frontend apps before this migration was written: the only call site was
// `resolveDeliveryRadiusFlag` inside `resolveCheckoutContext`
// (`apps/dgfy-api/src/modules/store/usecases/storeUseCases.js`), whose result was only ever copied
// into a quote-response payload and the `PosTransaction` create payload -- nothing ever branched on
// it. The real out-of-range signal is the GraphHopper-backed road-distance pipeline
// (`resolved.delivery.outOfRange`, ADR 0078 Decision 2 [binding]), which this migration does not
// touch. `haversineDistanceKm`/`resolveDeliveryRadiusFlag` and every read/write site were removed
// from `storeUseCases.js`/`PosTransaction.js`/`posUseCases.js` in the same PR.
//
// `apps/dgfy-migration-runner` only ever connects to the landlord DB -- `pos_transactions` is
// tenant-scoped, so this migration fans out over every active tenant database itself, mirroring
// 20260902000001-add-delivery-distance-capture.cjs (same pattern, inverted: DROP instead of ADD).
//
// Ordering dependency with 20260902000001: that migration added `delivery_distance_meters`
// positioned `AFTER \`outside_radius_flag\`` -- a one-time DDL placement instruction, not an
// ongoing constraint, so dropping `outside_radius_flag` here does not require moving
// `delivery_distance_meters` (MySQL does not re-shuffle other columns when a column is dropped).
// What DOES need fixing in the same commit is the *live* anchor reference in
// `apps/dgfy-api/scripts/sync-tenant-schemas.js`'s `REQUIRED_TENANT_SCHEMA_COLUMNS.pos_transactions
// .delivery_distance_meters` entry, which still says `AFTER \`outside_radius_flag\`` -- if left
// unfixed, a straggler tenant that self-repairs `delivery_distance_meters` for the first time after
// this migration ships would hit "Unknown column 'outside_radius_flag' in 'after'". That entry is
// updated in this same PR to anchor on `store_customer_id` instead (the column immediately before
// `outside_radius_flag` in the original 20260330000006 migration -- always present on any tenant
// old enough to have had `outside_radius_flag` at all, so no new missing-column risk is introduced).
//
// rollback_note: down() re-adds `outside_radius_flag` (BOOLEAN NOT NULL DEFAULT false), explicitly
// positioned `AFTER \`store_customer_id\`` rather than left to land at the end of the table --
// restoring its original pre-#1565 position (immediately before delivery_distance_meters), the
// other half of the "ordering dependency in both directions" this migration accounts for. Pure
// schema-level rollback: no data loss beyond the flag's own (already-unread) boolean values, and no
// fee-math/read-path dependency anywhere in the codebase to break.

const SAFE_IDENTIFIER_PATTERN = /^[A-Za-z0-9_-]+$/;
const POS_TRANSACTIONS_TABLE = 'pos_transactions';

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
      if (!(await columnExists(queryInterface, databaseName, POS_TRANSACTIONS_TABLE, 'outside_radius_flag'))) continue;

      await queryInterface.sequelize.query(`
        ALTER TABLE ${quoteIdentifier(databaseName)}.${quoteIdentifier(POS_TRANSACTIONS_TABLE)}
        DROP COLUMN ${quoteIdentifier('outside_radius_flag')}
      `);
    }
  },

  async down(queryInterface) {
    const currentDatabaseName = await getCurrentDatabaseName(queryInterface);
    if (!currentDatabaseName) return;
    const tenantDatabaseNames = await getActiveTenantDatabaseNames(queryInterface, currentDatabaseName);

    for (const databaseName of [...new Set([currentDatabaseName, ...tenantDatabaseNames])]) {
      if (!(await tableExists(queryInterface, databaseName, POS_TRANSACTIONS_TABLE))) continue;
      if (await columnExists(queryInterface, databaseName, POS_TRANSACTIONS_TABLE, 'outside_radius_flag')) continue;
      if (!(await columnExists(queryInterface, databaseName, POS_TRANSACTIONS_TABLE, 'store_customer_id'))) continue;

      await queryInterface.sequelize.query(`
        ALTER TABLE ${quoteIdentifier(databaseName)}.${quoteIdentifier(POS_TRANSACTIONS_TABLE)}
        ADD COLUMN ${quoteIdentifier('outside_radius_flag')} TINYINT(1) NOT NULL DEFAULT 0 AFTER ${quoteIdentifier('store_customer_id')}
      `);
    }
  }
};
