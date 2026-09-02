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
const SAFE_COLLATION_PATTERN = /^[A-Za-z0-9_]{1,64}$/;
const VOUCHER_REDEMPTIONS_TABLE = 'voucher_redemptions';
const POS_TRANSACTIONS_TABLE = 'pos_transactions';

const quoteIdentifier = (identifier) => {
  const normalized = String(identifier || '').trim();
  if (!SAFE_IDENTIFIER_PATTERN.test(normalized)) throw new Error(`Unsafe database identifier: ${identifier}`);
  return `\`${normalized}\``;
};

// #1464: voucher_redemptions.idempotency_key is pinned to utf8mb4_0900_ai_ci by PR #636's
// sync-tenant-schemas.js repair-path DDL, while pos_transactions.idempotency_key inherits whatever
// collation the database default was at creation time (utf8mb4_unicode_ci on affected tenants) --
// pos_transactions has no repair-path entry of its own, so nothing pins it. CONCAT(...) below
// resolves to the connection/session default collation, which can differ from vr.idempotency_key's
// own -- an `IN` comparing two differently-collated values fails outright on real MySQL 8 ("Illegal
// mix of collations"), even though neither side is wrong in isolation. Reading the collation live
// per database (rather than hardcoding utf8mb4_0900_ai_ci) makes the fix self-adapting regardless of
// which side actually drifted on a given tenant, and matching vr.idempotency_key's own collation
// keeps the uq_voucher_redemptions_idempotency unique index usable on the join -- a mismatched
// literal would force a full table scan inside a migration whose entrypoint retries 30x before
// failing the deploy. COLLATE cannot take a bound query placeholder (it's a syntactic modifier, not
// a value), so the detected name is interpolated directly into the SQL string -- SAFE_COLLATION_PATTERN
// guards that interpolation the same way SAFE_IDENTIFIER_PATTERN guards quoteIdentifier() above:
// never interpolate an unvalidated identifier into SQL. Normalizing the columns' collations
// themselves so they no longer drift is #640's scope, not this migration's -- this only makes the
// backfill's own join tolerant of whatever collation each side already has.
const getKeyColumnCollation = async (queryInterface, databaseName) => {
  const [rows] = await queryInterface.sequelize.query(
    'SELECT character_set_name AS charsetName, collation_name AS collationName '
      + 'FROM information_schema.columns '
      + 'WHERE table_schema = ? AND table_name = ? AND column_name = ?',
    { replacements: [databaseName, VOUCHER_REDEMPTIONS_TABLE, 'idempotency_key'] }
  );
  const charsetName = String(rows?.[0]?.charsetName || '').trim();
  const collationName = String(rows?.[0]?.collationName || '').trim();
  if (!SAFE_COLLATION_PATTERN.test(charsetName)) return null;
  if (!SAFE_COLLATION_PATTERN.test(collationName)) return null;
  return { charsetName, collationName };
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

// up()'s join fragment -- decides which rows this migration owns (idempotency-key pattern match).
// down() never calls this: it throws unconditionally instead of nulling anything out (see the
// rollback_note above). Split from the row filter (buildWhereSql, below) so up()'s statement can
// place SET between JOIN...ON and WHERE -- MySQL's multi-table UPDATE syntax requires
// UPDATE ... JOIN ... ON ... SET ... WHERE ..., not SET after WHERE (#1401).
const buildJoinSql = (db, keyCollation) => {
  const vr = `${quoteIdentifier(db)}.${quoteIdentifier(VOUCHER_REDEMPTIONS_TABLE)}`;
  const pt = `${quoteIdentifier(db)}.${quoteIdentifier(POS_TRANSACTIONS_TABLE)}`;
  const { charsetName, collationName } = keyCollation;
  return `${vr} vr JOIN ${pt} pt ON vr.idempotency_key IN (
      CONVERT(CONCAT('storefront:', pt.idempotency_key, ':', vr.voucher_id) USING ${charsetName}) COLLATE ${collationName},
      CONVERT(CONCAT('storefront:', pt.idempotency_key, ':delivery:', vr.voucher_id) USING ${charsetName}) COLLATE ${collationName}
    )`;
};

// The row filter -- kept separate from buildJoinSql() so it can be placed after SET in the
// statement, matching MySQL's UPDATE ... JOIN ... SET ... WHERE ... syntax. Includes
// pos_transaction_id IS NULL directly (previously bolted on by up() as a trailing "AND ..." onto
// buildJoinSql()'s own WHERE, which is exactly what put SET on the wrong side of WHERE).
const buildWhereSql = () =>
  `WHERE vr.channel = 'storefront' AND vr.entry_type = 'redemption' AND vr.pos_transaction_id IS NULL`;

module.exports = {
  async up(queryInterface) {
    const currentDatabaseName = await getCurrentDatabaseName(queryInterface);
    if (!currentDatabaseName) return;
    const tenantDatabaseNames = await getActiveTenantDatabaseNames(queryInterface, currentDatabaseName);
    for (const databaseName of [...new Set([currentDatabaseName, ...tenantDatabaseNames])]) {
      if (!(await tableExists(queryInterface, databaseName, VOUCHER_REDEMPTIONS_TABLE))) continue;
      if (!(await tableExists(queryInterface, databaseName, POS_TRANSACTIONS_TABLE))) continue;

      const keyCollation = await getKeyColumnCollation(queryInterface, databaseName);
      if (!keyCollation) continue; // column absent/unreadable -- the UPDATE would fail anyway

      await queryInterface.sequelize.query(
        `UPDATE ${buildJoinSql(databaseName, keyCollation)}
         SET vr.pos_transaction_id = pt.pos_transaction_id
         ${buildWhereSql()}`
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
