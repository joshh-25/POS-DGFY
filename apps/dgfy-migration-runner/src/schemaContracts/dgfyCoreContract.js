/**
 * Phase 02 DGFY core landlord schema contract.
 *
 * Single source of truth for the `dgfy_core` landlord database contract:
 * required tables, columns, indexes, unique constraints, and foreign keys
 * that the Phase 02 additive migration must create, plus an explicit
 * reject list of out-of-scope operational table names (product, POS,
 * inventory, fiscal, promo, and Storefront-operational domains — D-15,
 * ADR 0029) that must never appear in `dgfy_core`.
 *
 * D-01/D-04: `dgfy_core` is the landlord target; runner metadata stays in
 * the separate `dgfy_migration_meta` database and is not described here.
 *
 * Downstream consumers:
 * - apps/dgfy-migration-runner/src/migrations/schema/20260710020000-create-dgfy-core-foundation.cjs
 *   implements this contract's tables/indexes/foreign keys.
 * - Plan 04's `verify` command inspects `dgfy_core` against this same
 *   contract shape (key_links: "dgfyCoreContract.js -> migration -> verify
 *   command in Plan 04").
 */

export const dgfyCoreContract = {
  databaseName: 'dgfy_core',

  tables: {
    // D-06: DGFY account identity. Password hashes only; email/phone
    // verification timestamps are tracked separately so a deferred phone
    // verification is never treated as verified (ASVS V2).
    accounts: {
      columns: [
        'id',
        'first_name',
        'last_name',
        'email',
        'phone',
        'password_hash',
        'status',
        'email_verified_at',
        'phone_verified_at',
        'last_login_at',
        'created_at',
        'updated_at'
      ],
      indexes: ['unique_accounts_email', 'unique_accounts_phone'],
      uniqueConstraints: ['unique_accounts_email', 'unique_accounts_phone'],
      foreignKeys: [],
      projectionOnly: false
    },

    // D-06: stable public/business identity plus ownership/lifecycle status.
    // Canonical ownership relationships live in business_memberships (D-07).
    businesses: {
      columns: [
        'id',
        'business_handle',
        'legal_name',
        'display_name',
        'status',
        'created_at',
        'updated_at'
      ],
      indexes: ['unique_businesses_business_handle', 'idx_businesses_status'],
      uniqueConstraints: ['unique_businesses_business_handle'],
      foreignKeys: [],
      projectionOnly: false
    },

    // D-07: minimal membership model that supports single-owner semantics now
    // while remaining structurally ready for manager/member roles later,
    // without a disruptive schema rewrite.
    business_memberships: {
      columns: ['id', 'account_id', 'business_id', 'role', 'status', 'created_at', 'updated_at'],
      indexes: ['unique_business_memberships_business_account', 'idx_business_memberships_business_role'],
      uniqueConstraints: ['unique_business_memberships_business_account'],
      foreignKeys: [
        { column: 'account_id', referencesTable: 'accounts', referencesColumn: 'id' },
        { column: 'business_id', referencesTable: 'businesses', referencesColumn: 'id' }
      ],
      projectionOnly: false
    },

    // D-08: source of truth for business-to-database mapping. Stores only
    // names/pointers/status/verification timestamps — never credentials.
    business_database_registry: {
      columns: [
        'id',
        'business_id',
        'stable_opaque_suffix',
        'database_name',
        'status',
        'verified_at',
        'created_at',
        'updated_at'
      ],
      indexes: [
        'unique_business_database_registry_suffix',
        'unique_business_database_registry_database_name',
        'idx_business_database_registry_business_id'
      ],
      uniqueConstraints: [
        'unique_business_database_registry_suffix',
        'unique_business_database_registry_database_name'
      ],
      foreignKeys: [
        { column: 'business_id', referencesTable: 'businesses', referencesColumn: 'id' }
      ],
      projectionOnly: false
    },

    // D-09: minimal audit coverage for business creation, ownership/
    // membership changes, database pointer changes, and migration-sensitive
    // admin actions. Full account/admin lifecycle audit waits for API phases.
    business_audit_logs: {
      columns: [
        'audit_log_id',
        'business_id',
        'account_id',
        'action',
        'before_snapshot',
        'after_snapshot',
        'created_at'
      ],
      indexes: ['idx_business_audit_logs_business_time', 'idx_business_audit_logs_action'],
      uniqueConstraints: [],
      foreignKeys: [
        { column: 'business_id', referencesTable: 'businesses', referencesColumn: 'id' },
        { column: 'account_id', referencesTable: 'accounts', referencesColumn: 'id' }
      ],
      projectionOnly: false
    },

    // D-10/D-11/D-12/D-13: public Storefront discovery projection only.
    // Canonical branch/location truth lives in dgfy_business_* (Plan 03);
    // this table never defines operational branch/product/inventory/promo/
    // checkout truth and carries no company_token/credentials/tenant secrets.
    storefront_discovery_index: {
      columns: [
        'id',
        'business_id',
        'handle',
        'display_name',
        'is_visible',
        'location_snapshot',
        'search_snapshot',
        'last_synced_at',
        'created_at',
        'updated_at'
      ],
      indexes: [
        'unique_storefront_discovery_index_handle',
        'idx_storefront_discovery_index_business_id',
        'idx_storefront_discovery_index_visible'
      ],
      uniqueConstraints: ['unique_storefront_discovery_index_handle'],
      foreignKeys: [
        { column: 'business_id', referencesTable: 'businesses', referencesColumn: 'id' }
      ],
      projectionOnly: true
    }
  },

  // D-15/ADR 0029: product, inventory, POS, fiscal, promo, and Storefront
  // operational tables are explicitly out of scope for the dgfy_core
  // landlord foundation. Used both by this contract's own tests and by
  // Plan 04's verification scope guard.
  rejectedTables: [
    'items',
    'products',
    'skus',
    'product_variants',
    'categories',
    'purchase_orders',
    'job_orders',
    'stock_movements',
    'item_location_stocks',
    'fifo_batches',
    'suppliers',
    'supplier_items',
    'pos_transactions',
    'pos_transaction_lines',
    'shifts',
    'cashier_sessions',
    'terminal_sessions',
    'discounts',
    'promos',
    'promotions',
    'fiscal_receipts',
    'fiscal_compliance_logs',
    'checkout_sessions',
    'storefront_pages',
    'storefront_orders',
    'storefront_carts',
    'branches',
    'locations'
  ]
};

export default dgfyCoreContract;
