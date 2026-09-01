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
// rollback_note: forward-only, by design, not an oversight. up()'s join (buildJoinSql) matches on
// idempotency-key pattern + pos_transaction_id equality -- a condition that cannot distinguish "a
// row this migration's up() backfilled" from "a row the checkout-side attachRedemptionsToTransaction
// write path legitimately set afterward, via ordinary post-deploy checkout traffic." Both satisfy
// the identical join. Any down() built on that same join would silently NULL out live,
// freshly-created attribution links alongside the backfilled ones the moment any real checkout has
// happened post-deploy -- exactly the silent-data-corruption failure mode this repo already refuses
// elsewhere (see the enum-widening migrations in this epic, e.g.
// 20260830000003-add-cheque-payment-method.cjs's down(), which throws rather than risk a live write).
// No marker/tracking table is introduced to make the two cases distinguishable -- disproportionate
// complexity for a one-time backfill. down() below throws unconditionally instead: loud failure over
// silent corruption. No data is ever deleted by either direction of this migration; up() is the only
// state change, and it is a pure NULL -> value fill on one nullable attribution column.

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
  async down() {
    // Forward-only -- see the rollback_note above the join builder for why. up()'s join condition
    // (idempotency-key pattern + pos_transaction_id equality) cannot distinguish a row this
    // migration backfilled from a row the checkout-side write path legitimately set afterward, so
    // there is no query this function could run that would be safe to execute unconditionally.
    // Loud failure over silent data corruption, matching this repo's enum-widening migrations
    // (e.g. 20260830000003-add-cheque-payment-method.cjs's down()).
    throw new Error(
      'Migration 20260904000002 is forward-only: down() would silently null out live redemption-' +
        'transaction links written by the checkout-side attachRedemptionsToTransaction path after ' +
        'up() ran, alongside the legacy rows it actually backfilled -- the two are indistinguishable ' +
        'via the join this migration owns. Reverting the checkout-side code (leaving the backfilled ' +
        'links in place) is the correct rollback path instead; no data is deleted by doing so.'
    );
  }
};
