'use strict';

// Phase 242 (#1390, epic #1321). DATA-ONLY -- no schema change, no new/dropped column, nothing for
// sync-tenant-schemas.js to carry as repair. voucher_redemptions.pos_transaction_id has existed
// (and been indexed, idx_voucher_redemptions_transaction) since #455, but was written by nothing
// until this same PR's checkout-side change starts setting it going forward. This migration
// backfills it for storefront redemptions that were already recorded before that change shipped, so
// a cancel of one of those pre-existing orders can still find and reverse its redemption(s) without
// buildCancelStoreOrderUseCase's own exact-key fallback (which only covers the delivery axis -- see
// that use case's own comment on why the item axis has no equivalent reconstruction).
//
// Exact key match ONLY, never a LIKE/prefix scan -- the PR's own plan (section 3.2) documents why a
// prefix scan is rejected: payload.idempotency_key is client-supplied (only length >= 8 enforced),
// so two orders' keys can collide under a prefix match in a way an exact match cannot. The two exact
// keys mirror exactly how voucherRedemptionUseCases.js builds them at redemption time:
//   item axis:     storefront:<order.idempotency_key>:<redemption.voucher_id>
//   delivery axis: storefront:<order.idempotency_key>:delivery:<redemption.voucher_id>
//
// Scoped to channel = 'storefront' and entry_type = 'redemption' -- the POS half writes its own
// `pos:...` key namespace entirely and is out of scope here; a reversal row must never be
// re-attributed to an order by this backfill (its own idempotency_key already carries a distinct
// `reversal:<id>` shape that cannot match either CONCAT pattern, but the explicit filter costs
// nothing and removes the assumption).
//
// Tenant fan-out follows 20260901000004-add-tenant-location-delivery-timing-policy.cjs's exact
// pattern (landlord `tenants.db_name`, current DB included) -- this repo's established shape for a
// migration that must run against every tenant DB from the landlord-only migration-runner
// connection, just for an UPDATE instead of an ALTER TABLE.
//
// rollback_note: reversible by re-running the identical join and setting pos_transaction_id back to
// NULL for exactly the rows it would have set -- down() does this rather than a blanket
// "set every storefront redemption's pos_transaction_id to NULL," which would also undo the
// checkout-side write this PR ships alongside this migration (a legitimate write, not backfill
// debt). No data is deleted at any point; only this one nullable attribution column moves.

const SAFE_IDENTIFIER_PATTERN = /^[A-Za-z0-9_-]+$/;
const VOUCHER_REDEMPTIONS_TABLE = 'voucher_redemptions';
const POS_TRANSACTIONS_TABLE = 'pos_transactions';

const quoteIdentifier = (identifier) => {
  const normalized = String(identifier || '').trim();
  if (!SAFE_IDENTIFIER_PATTERN.test(normalized)) throw new Error(`Unsafe database identifier: ${identifier}`);
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

// Shared by up() and down() -- the exact join that decides which rows this migration owns. up()
// writes pos_transaction_id from it; down() nulls out exactly the same set.
const buildJoinSql = (db) => {
  const vr = `${quoteIdentifier(db)}.${quoteIdentifier(VOUCHER_REDEMPTIONS_TABLE)}`;
  const pt = `${quoteIdentifier(db)}.${quoteIdentifier(POS_TRANSACTIONS_TABLE)}`;
  return `${vr} vr JOIN ${pt} pt ON vr.idempotency_key IN (
      CONCAT('storefront:', pt.idempotency_key, ':', vr.voucher_id),
      CONCAT('storefront:', pt.idempotency_key, ':delivery:', vr.voucher_id)
    )
    WHERE vr.channel = 'storefront' AND vr.entry_type = 'redemption'`;
};

module.exports = {
  async up(queryInterface) {
    const currentDatabaseName = await getCurrentDatabaseName(queryInterface);
    if (!currentDatabaseName) return;
    const tenantDatabaseNames = await getActiveTenantDatabaseNames(queryInterface, currentDatabaseName);
    for (const databaseName of [...new Set([currentDatabaseName, ...tenantDatabaseNames])]) {
      if (!(await tableExists(queryInterface, databaseName, VOUCHER_REDEMPTIONS_TABLE))) continue;
      if (!(await tableExists(queryInterface, databaseName, POS_TRANSACTIONS_TABLE))) continue;

      await queryInterface.sequelize.query(
        `UPDATE ${buildJoinSql(databaseName)} AND vr.pos_transaction_id IS NULL
         SET vr.pos_transaction_id = pt.pos_transaction_id`
      );
    }
  },
  async down(queryInterface) {
    const currentDatabaseName = await getCurrentDatabaseName(queryInterface);
    if (!currentDatabaseName) return;
    const tenantDatabaseNames = await getActiveTenantDatabaseNames(queryInterface, currentDatabaseName);
    for (const databaseName of [...new Set([currentDatabaseName, ...tenantDatabaseNames])]) {
      if (!(await tableExists(queryInterface, databaseName, VOUCHER_REDEMPTIONS_TABLE))) continue;
      if (!(await tableExists(queryInterface, databaseName, POS_TRANSACTIONS_TABLE))) continue;

      await queryInterface.sequelize.query(
        `UPDATE ${buildJoinSql(databaseName)} AND vr.pos_transaction_id = pt.pos_transaction_id
         SET vr.pos_transaction_id = NULL`
      );
    }
  }
};
