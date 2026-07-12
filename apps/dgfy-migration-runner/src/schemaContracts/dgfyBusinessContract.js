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

    // Wave 7 gap-closure (04-07-PLAN.md, API-02/API-04): durable tenant-local
    // staff invitation record. Only a token_hash is stored — the raw
    // invitation token is never persisted (T-04-07-02). Additive migration
    // 20260711143000-add-dgfy-business-staff-invitations.cjs implements this
    // entry (kept separate from the original foundation migration, which
    // predates this table and is intentionally left unchanged).
    staff_invitations: {
      columns: [
        'id',
        'staff_account_id',
        'email',
        'token_hash',
        'status',
        'expires_at',
        'accepted_at',
        'created_at',
        'updated_at'
      ],
      indexes: [
        'unique_staff_invitations_token_hash',
        'idx_staff_invitations_email',
        'idx_staff_invitations_status'
      ],
      uniqueConstraints: ['unique_staff_invitations_token_hash'],
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
    },

    // --- Phase 08 Commerce Domain foundation (08-01-PLAN.md) ----------------
    // Implemented by
    // apps/dgfy-migration-runner/src/migrations/schema/20260712100000-create-commerce-foundation.cjs.
    // These 8 tables were previously out-of-scope operational names (D-15) —
    // 'products' and 'shifts' are removed from rejectedTables below now that
    // Phase 08 legitimizes them. 'stock_movements' stays rejected: the new
    // append-only ledger is named inventory_movements (Pitfall 1/PRD-04/
    // PRD-05), never stock_movements.

    // PRD-03/D-14: flat, business-scoped folder grouping — no parent_id
    // nesting (D-14 supersedes legacy ItemFolder.js's self-nesting FK).
    product_folders: {
      columns: [
        'id',
        'business_id',
        'name',
        'description',
        'show_in_pos_filter',
        'is_active',
        'created_at',
        'updated_at'
      ],
      indexes: ['unique_product_folders_business_name'],
      uniqueConstraints: ['unique_product_folders_business_name'],
      foreignKeys: [],
      projectionOnly: false
    },

    // PRD-01/PRD-02/BOK-01: category lives on the Product, not the Store;
    // inventory_mode only (D-07 — stock_effect_type is Phase 9's
    // AvailmentItem, not this table).
    products: {
      columns: [
        'id',
        'business_id',
        'folder_id',
        'name',
        'category',
        'inventory_mode',
        'stock_count',
        'base_price',
        'is_bookable',
        'slot_duration_minutes',
        'concurrent_capacity',
        'is_active',
        'created_at',
        'updated_at'
      ],
      indexes: ['idx_products_business', 'idx_products_folder', 'idx_products_category'],
      uniqueConstraints: [],
      foreignKeys: [
        { column: 'folder_id', referencesTable: 'product_folders', referencesColumn: 'id' }
      ],
      projectionOnly: false
    },

    // PRD-04/D-06: append-only ledger, sole writer modules/inventory (ADR
    // 0029). movement_type reserves (unwired) sale/booking values. Never
    // named stock_movements.
    inventory_movements: {
      columns: [
        'id',
        'business_id',
        'product_id',
        'movement_type',
        'quantity',
        'reference_type',
        'reference_id',
        'actor_account_id',
        'actor_staff_account_id',
        'before_snapshot',
        'after_snapshot',
        'created_at'
      ],
      indexes: ['idx_inventory_movements_business_product', 'idx_inventory_movements_movement_type'],
      uniqueConstraints: [],
      foreignKeys: [
        { column: 'product_id', referencesTable: 'products', referencesColumn: 'id' },
        { column: 'actor_staff_account_id', referencesTable: 'staff_accounts', referencesColumn: 'id' }
      ],
      projectionOnly: false
    },

    // BOK-01/BOK-02/BOK-03: availment_id reserved, no FK (Availment table is
    // Phase 9). customer_account_id opaque UUID, no cross-DB FK (D-09).
    bookings: {
      columns: [
        'id',
        'business_id',
        'product_id',
        'branch_id',
        'customer_account_id',
        'slot_start',
        'slot_end',
        'status',
        'availment_id',
        'cancelled_at',
        'created_at',
        'updated_at'
      ],
      indexes: ['idx_bookings_business_product_branch_slot', 'idx_bookings_customer_account'],
      uniqueConstraints: [],
      foreignKeys: [
        { column: 'product_id', referencesTable: 'products', referencesColumn: 'id' },
        { column: 'branch_id', referencesTable: 'locations', referencesColumn: 'id' }
      ],
      projectionOnly: false
    },

    // BOK-02: branch-level slot capacity counter — atomic guarded UPDATE
    // (Pattern D), never findOne-then-update.
    booking_capacity: {
      columns: [
        'id',
        'business_id',
        'product_id',
        'branch_id',
        'slot_start',
        'slots_remaining',
        'created_at',
        'updated_at'
      ],
      indexes: ['unique_booking_capacity_product_branch_slot'],
      uniqueConstraints: ['unique_booking_capacity_product_branch_slot'],
      foreignKeys: [
        { column: 'product_id', referencesTable: 'products', referencesColumn: 'id' },
        { column: 'branch_id', referencesTable: 'locations', referencesColumn: 'id' }
      ],
      projectionOnly: false
    },

    // SFT-01/SFT-02, D-12/D-13: active_terminal_cashier_key is a MySQL
    // GENERATED ALWAYS AS (...) STORED column; its unique index is the
    // DB-level one-open-shift-per-(terminal,cashier) invariant.
    // cashier_account_id is the tenant-local staff_accounts.id (D-13), not
    // the landlord dgfy_account_id.
    shifts: {
      columns: [
        'id',
        'business_id',
        'terminal_id',
        'cashier_account_id',
        'cashier_dgfy_account_id',
        'status',
        'opening_float_amount',
        'expected_cash_amount',
        'closing_cash_amount',
        'cash_variance_amount',
        'opened_at',
        'closed_at',
        'active_terminal_cashier_key',
        'created_at',
        'updated_at'
      ],
      indexes: ['uq_shifts_active_terminal_cashier'],
      uniqueConstraints: ['uq_shifts_active_terminal_cashier'],
      foreignKeys: [
        { column: 'terminal_id', referencesTable: 'terminal_identities', referencesColumn: 'id' },
        { column: 'cashier_account_id', referencesTable: 'staff_accounts', referencesColumn: 'id' }
      ],
      projectionOnly: false
    },

    // SFT-03: append-only, sole writer modules/shifts. event_type reserves
    // (unwired) pay_in/pay_out values (D-10).
    cash_drawer_events: {
      columns: [
        'id',
        'business_id',
        'shift_id',
        'event_type',
        'amount',
        'reason',
        'actor_staff_account_id',
        'created_at'
      ],
      indexes: ['idx_cash_drawer_events_shift', 'idx_cash_drawer_events_event_type'],
      uniqueConstraints: [],
      foreignKeys: [
        { column: 'shift_id', referencesTable: 'shifts', referencesColumn: 'id' },
        { column: 'actor_staff_account_id', referencesTable: 'staff_accounts', referencesColumn: 'id' }
      ],
      projectionOnly: false
    },

    // FSC-01/FSC-02, D-01: tenant-scoped compliance-mode state (not
    // dgfy_core). D-02/D-03 enum/policy-pack shapes; D-04 manual
    // verification review fields.
    compliance_mode_state: {
      columns: [
        'id',
        'business_id',
        'branch_id',
        'state',
        'compliance_profile',
        'active_policy_pack_version',
        'verification_status',
        'verified_by_actor_type',
        'verified_at',
        'created_at',
        'updated_at'
      ],
      indexes: ['unique_compliance_mode_state_business_branch'],
      uniqueConstraints: ['unique_compliance_mode_state_business_branch'],
      foreignKeys: [
        { column: 'branch_id', referencesTable: 'locations', referencesColumn: 'id' }
      ],
      projectionOnly: false
    }
  },

  // D-15/ADR 0029: product, inventory, POS, fiscal, promo, and Storefront
  // operational tables are explicitly out of scope for the dgfy_business_*
  // tenant foundation. Used both by this contract's own tests and by
  // Plan 04's verification scope guard.
  //
  // Phase 08 (08-01-PLAN.md) legitimizes 'products' and 'shifts' — they are
  // now real tables{} entries above (created by
  // 20260712100000-create-commerce-foundation.cjs), so both names are
  // REMOVED from this list. 'stock_movements' stays rejected: the new
  // append-only ledger is named inventory_movements, which is a different,
  // non-rejected name (Pitfall 1).
  rejectedTables: [
    'items',
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
