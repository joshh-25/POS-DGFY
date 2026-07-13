/**
 * Phase 02-10 DGFY core landlord schema contract.
 *
 * Single source of truth for the `dgfy_core` landlord database contract:
 * required tables, columns, indexes, unique constraints, and foreign keys
 * that additive migrations (Phase 02, 10) must create, plus an explicit
 * reject list of out-of-scope operational table names (product, POS,
 * inventory, fiscal, promo, and unimplemented Storefront-operational
 * domains — D-15, ADR 0029) that must never appear in `dgfy_core`.
 *
 * D-01/D-04: `dgfy_core` is the landlord target; runner metadata stays in
 * the separate `dgfy_migration_meta` database and is not described here.
 *
 * Phase 10 addition (STF-03, STF-04, STF-05): Storefront commerce foundation
 * tables (storefront_guest_identities, storefront_orders, commerce_payment_sessions)
 * are now legitimate landlord tables, hence removed from rejectedTables. Discovery
 * projection gains generated columns for geo/full-text search (latitude, longitude,
 * search_text).
 *
 * Downstream consumers:
 * - apps/dgfy-migration-runner/src/migrations/schema/20260710020000-create-dgfy-core-foundation.cjs
 *   implements Phase 02 tables/indexes/foreign keys.
 * - apps/dgfy-migration-runner/src/migrations/schema/20260714100000-create-storefront-commerce-landlord.cjs
 *   implements Phase 10 tables/indexes.
 * - apps/dgfy-migration-runner/src/migrations/schema/20260714101000-enable-storefront-discovery-geo-search.cjs
 *   adds Phase 10 discovery generated columns + indexes.
 * - Phase verification commands inspect `dgfy_core` against this contract shape.
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
    // Phase 10 addition: gains latitude/longitude/search_text GENERATED columns
    // plus spatial and FULLTEXT indexes (STF-01 discovery geo/search).
    storefront_discovery_index: {
      columns: [
        'id',
        'business_id',
        'handle',
        'display_name',
        'is_visible',
        'location_snapshot',
        'search_snapshot',
        'latitude',
        'longitude',
        'search_text',
        'last_synced_at',
        'created_at',
        'updated_at'
      ],
      indexes: [
        'unique_storefront_discovery_index_handle',
        'idx_storefront_discovery_index_business_id',
        'idx_storefront_discovery_index_visible',
        'idx_storefront_discovery_geo_spatial',
        'ftx_storefront_discovery_search_text'
      ],
      uniqueConstraints: ['unique_storefront_discovery_index_handle'],
      foreignKeys: [
        { column: 'business_id', referencesTable: 'businesses', referencesColumn: 'id' }
      ],
      projectionOnly: true
    },

    // Phase 10 STF-03: Lightweight persistent guest identity keyed by
    // verified email. Enables repeat-guest recognition across storefront
    // orders (not a full DGFY Account, just email + optional contact/name).
    // D-06 requirement: guests verified via email OTP (apps/dgfy-api/src/infra/emailOtp.js).
    storefront_guest_identities: {
      columns: [
        'id',
        'verified_email',
        'phone',
        'display_name',
        'last_order_at',
        'created_at',
        'updated_at'
      ],
      indexes: ['unique_storefront_guest_identities_email'],
      uniqueConstraints: ['unique_storefront_guest_identities_email'],
      foreignKeys: [],
      projectionOnly: false
    },

    // Phase 10 STF-05: Durable landlord-side order record, created before
    // any tenant write or payment session exists. Enables idempotent lookup
    // and cross-database finalization guarantee. Must_have key_links:
    // storefront_orders.public_reference is UNIQUE (opaque lookup + Availment
    // source_reference cross-DB guard); composite UNIQUE (tenant_id, target_type,
    // idempotency_key) prevents duplicate-order collisions (client idempotency,
    // ADR 0027 #17 pattern).
    storefront_orders: {
      columns: [
        'id',
        'public_reference',
        'tenant_id',
        'target_type',
        'idempotency_key',
        'request_hash',
        'status',
        'customer_account_id',
        'guest_identity_id',
        'fulfillment_mode',
        'fulfillment_timing',
        'requested_for',
        'payment_method',
        'checkout_payload',
        'total_centavos',
        'availment_id',
        'expires_at',
        'created_at',
        'updated_at'
      ],
      indexes: [
        'unique_storefront_orders_public_reference',
        'unique_storefront_orders_idempotency',
        'idx_storefront_orders_status',
        'idx_storefront_orders_tenant_status'
      ],
      uniqueConstraints: [
        'unique_storefront_orders_public_reference',
        'unique_storefront_orders_idempotency'
      ],
      foreignKeys: [
        { column: 'guest_identity_id', referencesTable: 'storefront_guest_identities', referencesColumn: 'id' }
      ],
      projectionOnly: false
    },

    // Phase 10 STF-04, D-01: Landlord-owned PayMongo payment sessions
    // (ADR 0027 pattern). One session per storefront order; resolves tenant
    // context before async webhook-driven order finalization (STF-05).
    // D-02: split_payload + platform_fee_centavos nullable, never populated
    // in Phase 10 (adjustable for future per-tenant split without re-architecture).
    commerce_payment_sessions: {
      columns: [
        'id',
        'public_reference',
        'storefront_order_id',
        'tenant_id',
        'status',
        'provider',
        'provider_payment_intent_id',
        'provider_payment_id',
        'qr_code_image_url',
        'amount_centavos',
        'expires_at',
        'paid_at',
        'finalized_at',
        'manual_resolution_reason',
        'split_payload',
        'platform_fee_centavos',
        'created_at',
        'updated_at'
      ],
      indexes: [
        'unique_commerce_payment_sessions_reference',
        'idx_commerce_payment_sessions_intent_id',
        'idx_commerce_payment_sessions_payment_id',
        'idx_commerce_payment_sessions_tenant_status'
      ],
      uniqueConstraints: ['unique_commerce_payment_sessions_reference'],
      foreignKeys: [
        { column: 'storefront_order_id', referencesTable: 'storefront_orders', referencesColumn: 'id' }
      ],
      projectionOnly: false
    }
  },

  // D-15/ADR 0029: product, inventory, POS, fiscal, promo, and unimplemented
  // Storefront operational tables are explicitly out of scope for the dgfy_core
  // landlord foundation. Phase 10 legitimizes storefront_orders, storefront_guest_identities,
  // and commerce_payment_sessions (now in tables above), but checkout_sessions,
  // storefront_pages, and storefront_carts remain out of scope.
  // Used both by this contract's own tests and by phase verification scope guards.
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
    'storefront_carts',
    'branches',
    'locations'
  ]
};

export default dgfyCoreContract;
