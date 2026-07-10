/**
 * Phase 02 Plan 03 DGFY per-business tenant schema contract.
 *
 * Single source of truth for the `dgfy_business_<stable_opaque_suffix>`
 * per-business tenant database contract (D-02/D-03/D-10/D-14): required
 * tables, columns, indexes, unique constraints, and foreign keys the
 * additive foundation migration must create, plus an explicit reject list
 * of out-of-scope operational table names (product, POS, inventory, fiscal,
 * promo, and Storefront-operational domains — D-15, ADR 0029) that must
 * never appear in a `dgfy_business_*` database.
 *
 * D-10: canonical branches/locations live here, not in `dgfy_core` (which
 * only keeps the `storefront_discovery_index` projection — see
 * dgfyCoreContract.js).
 *
 * Cross-database references: `dgfy_account_id`/`owner_dgfy_account_id`
 * columns point at `dgfy_core.accounts.id` and `business_id` points at
 * `dgfy_core.businesses.id` — these are opaque UUID columns only, never
 * real foreign keys, because MySQL cannot enforce a foreign key across two
 * separate databases. Every `foreignKeys` entry below is a same-database
 * (tenant-local) relationship only.
 *
 * Downstream consumers:
 * - apps/dgfy-migration-runner/src/migrations/schema/20260710021000-create-dgfy-business-foundation.cjs
 *   implements this contract's tables/indexes/foreign keys.
 * - Plan 04's `verify` command inspects each targeted `dgfy_business_*`
 *   database against this same contract shape (key_links: "dgfyBusinessContract.js
 *   -> migration -> verification contract in Plan 04").
 */

export const dgfyBusinessContract = {
  // Not a literal database name (each business has its own
  // dgfy_business_<stable_opaque_suffix> database) — this documents the
  // naming pattern the contract applies to (D-02/D-03).
  databaseNamePattern: 'dgfy_business_<stable_opaque_suffix>',

  tables: {
    // D-10: canonical branch/location truth lives here, not in dgfy_core.
    locations: {
      columns: [
        'id',
        'name',
        'address_line',
        'latitude',
        'longitude',
        'is_active',
        'is_primary',
        'created_at',
        'updated_at'
      ],
      indexes: ['idx_locations_active', 'idx_locations_primary'],
      uniqueConstraints: [],
      foreignKeys: [],
      projectionOnly: false
    },

    // D-14: tenant-local staff authorization profile. Login/identity itself
    // is DGFY-account-based (landlord dgfy_core.accounts); this table is the
    // tenant-local staff record an account_staff_assignments row links to.
    staff_accounts: {
      columns: [
        'id',
        'display_name',
        'email',
        'phone',
        'status',
        'is_master_admin',
        'created_at',
        'updated_at'
      ],
      indexes: ['unique_staff_accounts_email', 'idx_staff_accounts_status'],
      uniqueConstraints: ['unique_staff_accounts_email'],
      foreignKeys: [],
      projectionOnly: false
    },

    // D-14: DGFY account-to-staff assignment/link metadata. dgfy_account_id
    // is an opaque UUID pointing at dgfy_core.accounts.id — never a real FK
    // (cross-database), and never a place to cache credentials.
    account_staff_assignments: {
      columns: [
        'id',
        'dgfy_account_id',
        'staff_account_id',
        'role',
        'status',
        'invited_at',
        'accepted_at',
        'created_at',
        'updated_at'
      ],
      indexes: [
        'unique_account_staff_assignments_dgfy_account',
        'idx_account_staff_assignments_staff_account',
        'idx_account_staff_assignments_status'
      ],
      uniqueConstraints: ['unique_account_staff_assignments_dgfy_account'],
      foreignKeys: [
        { column: 'staff_account_id', referencesTable: 'staff_accounts', referencesColumn: 'id' }
      ],
      projectionOnly: false
    },

    // D-14: role/permission basics needed for future tenant session checks.
    roles: {
      columns: ['id', 'name', 'description', 'created_at', 'updated_at'],
      indexes: ['unique_roles_name'],
      uniqueConstraints: ['unique_roles_name'],
      foreignKeys: [],
      projectionOnly: false
    },

    role_permissions: {
      columns: ['id', 'role_id', 'permission_key', 'created_at'],
      indexes: ['unique_role_permissions_role_permission', 'idx_role_permissions_role_id'],
      uniqueConstraints: ['unique_role_permissions_role_permission'],
      foreignKeys: [
        { column: 'role_id', referencesTable: 'roles', referencesColumn: 'id' }
      ],
      projectionOnly: false
    },

    // D-14/T-02-03-04: terminal identity/policy lookup foundation — identity
    // and location binding only, no checkout/payment behavior.
    terminal_identities: {
      columns: [
        'id',
        'terminal_code',
        'label',
        'location_id',
        'status',
        'last_seen_at',
        'created_at',
        'updated_at'
      ],
      indexes: [
        'unique_terminal_identities_terminal_code',
        'idx_terminal_identities_location_id',
        'idx_terminal_identities_status'
      ],
      uniqueConstraints: ['unique_terminal_identities_terminal_code'],
      foreignKeys: [
        { column: 'location_id', referencesTable: 'locations', referencesColumn: 'id' }
      ],
      projectionOnly: false
    },

    // D-14: tenant-local owner/business linkage metadata. business_id and
    // owner_dgfy_account_id are opaque UUIDs pointing at dgfy_core.businesses
    // and dgfy_core.accounts respectively — never real (cross-database) FKs.
    tenant_ownership_metadata: {
      columns: [
        'id',
        'business_id',
        'business_handle',
        'stable_opaque_suffix',
        'owner_dgfy_account_id',
        'created_at',
        'updated_at'
      ],
      indexes: ['unique_tenant_ownership_metadata_business_id'],
      uniqueConstraints: ['unique_tenant_ownership_metadata_business_id'],
      foreignKeys: [],
      projectionOnly: false
    },

    // D-14: tenant-local audit/ownership metadata for staff assignment,
    // role/permission, terminal identity, location, and ownership metadata
    // changes. actor_dgfy_account_id is an opaque UUID (landlord accounts.id)
    // — never a real (cross-database) FK.
    tenant_audit_logs: {
      columns: [
        'audit_log_id',
        'actor_dgfy_account_id',
        'staff_account_id',
        'action',
        'before_snapshot',
        'after_snapshot',
        'created_at'
      ],
      indexes: ['idx_tenant_audit_logs_action', 'idx_tenant_audit_logs_time'],
      uniqueConstraints: [],
      foreignKeys: [
        { column: 'staff_account_id', referencesTable: 'staff_accounts', referencesColumn: 'id' }
      ],
      projectionOnly: false
    }
  },

  // D-15/ADR 0029: product, inventory, POS, fiscal, promo, and Storefront
  // operational tables are explicitly out of scope for the dgfy_business_*
  // tenant foundation. Used both by this contract's own tests and by
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
    'storefront_carts'
  ]
};

export default dgfyBusinessContract;
