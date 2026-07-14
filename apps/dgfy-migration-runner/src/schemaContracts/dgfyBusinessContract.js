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

    // D-14 / Phase 13.5: tenant-local staff authorization profile. Login is
    // tenant-local via staff_credentials; optional DGFY account linkage is
    // represented by account_staff_assignments (D-13.5-01, D-13.5-03; ADR
    // 0028 Amendment).
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

    // Phase 13.5 (STAFF-01): tenant-local staff credentials live in the same
    // tenant database, separated from staff_accounts profile serialization.
    // Additive migration 20260717000000-add-dgfy-business-staff-credentials.cjs
    // implements this entry and only stores bcrypt hashes copied from legacy,
    // never raw passwords, PINs, tokens, or reset secrets.
    staff_credentials: {
      columns: [
        'id',
        'staff_account_id',
        'password_hash',
        'pos_approval_pin_hash',
        'credential_status',
        'password_updated_at',
        'created_at',
        'updated_at'
      ],
      indexes: [
        'unique_staff_credentials_staff_account',
        'idx_staff_credentials_status'
      ],
      uniqueConstraints: ['unique_staff_credentials_staff_account'],
      foreignKeys: [
        { column: 'staff_account_id', referencesTable: 'staff_accounts', referencesColumn: 'id' }
      ],
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
    //
    // Phase 12 (12-02-PLAN.md, LDM-02): additive
    // 20260716100000-extend-schema-for-legacy-migration.cjs adds 6 typed
    // columns ported from legacy items (sku_code, description,
    // unit_of_measure, cost_per_unit, vat_type,
    // senior_pwd_discount_eligible) plus `attributes` JSON — the
    // satellite-folding container reserved for Phase 13's mapper (see
    // docs/database/legacy-product-attributes-folding-design.md). D-05:
    // idx_products_sku_code is non-unique — legacy allows duplicate SKUs.
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
        'sku_code',
        'description',
        'unit_of_measure',
        'cost_per_unit',
        'vat_type',
        'senior_pwd_discount_eligible',
        'attributes',
        'created_at',
        'updated_at'
      ],
      indexes: ['idx_products_business', 'idx_products_folder', 'idx_products_category', 'idx_products_sku_code'],
      uniqueConstraints: [],
      foreignKeys: [
        { column: 'folder_id', referencesTable: 'product_folders', referencesColumn: 'id' }
      ],
      projectionOnly: false
    },

    // PRD-04/D-06: append-only ledger, sole writer modules/inventory (ADR
    // 0029). movement_type reserves (unwired) sale/booking values. Never
    // named stock_movements.
    //
    // Phase 12 (12-02-PLAN.md, LDM-04, D-10): additive
    // 20260716100000-extend-schema-for-legacy-migration.cjs adds
    // unique_inventory_movements_natural_key on (business_id, product_id,
    // reference_type, reference_id) — makes Phase 13's migrated-row apply
    // retries idempotent per (order, product) line. product_id is required
    // in the key: checkout finalize and reservation-commit both write one
    // row per product line sharing the same (business_id, reference_type,
    // reference_id) — an order-only key breaks any multi-product order
    // (CR-01 fix, 12-REVIEW.md). Existing Phase 8/9 organic rows have NULL
    // reference_type/reference_id; MySQL's unique index treats NULL tuples
    // as distinct, so this is a pure additive DDL change with no backfill.
    // NOTE: this contract only asserts index *existence* by name (see
    // verify.js checkContractSchema) — column composition is not
    // independently re-checked here, so the migration + model files above
    // are the source of truth for the actual column list.
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
      indexes: [
        'idx_inventory_movements_business_product',
        'idx_inventory_movements_movement_type',
        'unique_inventory_movements_natural_key'
      ],
      uniqueConstraints: ['unique_inventory_movements_natural_key'],
      foreignKeys: [
        { column: 'product_id', referencesTable: 'products', referencesColumn: 'id' },
        { column: 'actor_staff_account_id', referencesTable: 'staff_accounts', referencesColumn: 'id' }
      ],
      projectionOnly: false
    },

    // Phase 12 (12-02-PLAN.md, LDM-03, D-09): NEW table — one row per
    // product (strict 1:1, matching legacy item_embeddings' existing
    // shape). vector is TEXT (legacy JSON-stringified float array shape).
    // legacy_embedding_id is an optional traceability pointer back to the
    // legacy row (A2). Modeled on the product_folders entry's shape.
    product_embeddings: {
      columns: [
        'id',
        'business_id',
        'product_id',
        'vector',
        'legacy_embedding_id',
        'created_at',
        'updated_at'
      ],
      indexes: ['unique_product_embeddings_product'],
      uniqueConstraints: ['unique_product_embeddings_product'],
      foreignKeys: [
        { column: 'product_id', referencesTable: 'products', referencesColumn: 'id' }
      ],
      projectionOnly: false
    },

    // D-07/D-09/D-10: stock-reservation ledger, sole writer modules/inventory
    // (ADR 0029). Storefront orders place temporary holds; expired holds
    // excluded from availability on-read (D-09); failed reserve throws
    // TenantDatabaseUnavailableError (D-10); convert to sale via recordSale
    // (ADR 0029).
    inventory_reservations: {
      columns: [
        'id',
        'business_id',
        'product_id',
        'quantity',
        'reference_type',
        'reference_id',
        'status',
        'expires_at',
        'created_at',
        'updated_at'
      ],
      indexes: ['idx_inventory_reservations_product_status', 'idx_inventory_reservations_reference', 'idx_inventory_reservations_expiry'],
      uniqueConstraints: [],
      foreignKeys: [
        { column: 'product_id', referencesTable: 'products', referencesColumn: 'id' }
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
        'branch_scope_key',
        'state',
        'compliance_profile',
        'active_policy_pack_version',
        'verification_status',
        'verified_by_actor_type',
        'verified_at',
        'created_at',
        'updated_at'
      ],
      // Phase 08 gap-closure (08-09-PLAN.md, CR-01/FSC-01):
      // 20260712140000-harden-compliance-mode-state-uniqueness.cjs replaces
      // the plain (business_id, branch_id) unique index with
      // unique_compliance_mode_state_business_branch_scope on
      // (business_id, branch_scope_key) — a STORED generated column
      // (= COALESCE(branch_id, 0)) — because MySQL treats every NULL
      // branch_id as distinct, so the old index could not enforce
      // one-row-per-business when branch_id IS NULL.
      indexes: ['unique_compliance_mode_state_business_branch_scope'],
      uniqueConstraints: ['unique_compliance_mode_state_business_branch_scope'],
      foreignKeys: [
        { column: 'branch_id', referencesTable: 'locations', referencesColumn: 'id' }
      ],
      projectionOnly: false
    },

    // CHK-01..CHK-06, D-01/D-15 (Phase 9, 20260713120000-create-availment-
    // checkout.cjs). NOTE: this entry, plus `payments` below, close a
    // pre-existing Phase 9 gap discovered while implementing 10-07 —
    // 09-01-SUMMARY.md claimed six new contract entries (availments,
    // availment_items, availment_discounts, payments, receipts,
    // compliance_evidence) were added here, but git history shows no Phase 9
    // commit ever touched this file. Only the two tables 10-07 itself
    // modifies (availments, payments) are backfilled here; the other four
    // (availment_items, availment_discounts, receipts, compliance_evidence)
    // remain missing and are logged in deferred-items.md as out-of-scope for
    // this plan.
    //
    // source_reference (10-07, T-10-07-01): cross-DB idempotency guard for
    // the storefront-order -> tenant-Availment finalize seam. NULL for every
    // POS availment; UNIQUE per business so a lost-guard duplicate-finalize
    // race collapses to one row.
    // fulfillment_mode/fulfillment_status/fulfillment_stage (11-01, FUL-01..
    // FUL-03, L5): denormalized read-cache columns mirroring the LATEST
    // availment_stage_events row — additive/nullable, no backfill of
    // pre-migration availments (A4). Distinct from `status` above (Landmine
    // 1) — `status` is the draft/finalized/voided checkout lifecycle,
    // `fulfillment_status` is the separate coarse fulfillment pipeline.
    availments: {
      columns: [
        'id',
        'business_id',
        'branch_id',
        'customer_account_id',
        'shift_id',
        'terminal_id',
        'cashier_account_id',
        'cashier_dgfy_account_id',
        'status',
        'document_context',
        'subtotal_amount',
        'discount_amount',
        'vat_amount',
        'vat_exempt_amount',
        'total_amount',
        'sc_pwd_id_number',
        'sc_pwd_metadata',
        'finalized_at',
        'source_reference',
        'fulfillment_mode',
        'fulfillment_status',
        'fulfillment_stage',
        'created_at',
        'updated_at'
      ],
      indexes: ['idx_availments_business_status', 'unique_availments_source_reference'],
      uniqueConstraints: ['unique_availments_source_reference'],
      foreignKeys: [
        { column: 'branch_id', referencesTable: 'locations', referencesColumn: 'id' },
        { column: 'shift_id', referencesTable: 'shifts', referencesColumn: 'id' },
        { column: 'terminal_id', referencesTable: 'terminal_identities', referencesColumn: 'id' },
        { column: 'cashier_account_id', referencesTable: 'staff_accounts', referencesColumn: 'id' }
      ],
      projectionOnly: false
    },

    // D-08/D-09/D-10 (Phase 9). payment_reference (10-07, T-10-07-04): opaque
    // external gateway reference (e.g. PayMongo `pay_...`), stored separately
    // from the payment_method ENUM so mapping the QR Ph rail onto
    // cash/gcash/credit_card (A4) never requires an ENUM migration.
    payments: {
      columns: [
        'id',
        'business_id',
        'availment_id',
        'payment_method',
        'amount_received',
        'change_due',
        'payment_handoff_mode',
        'payment_reference',
        'created_at'
      ],
      indexes: ['idx_payments_business_availment'],
      uniqueConstraints: [],
      foreignKeys: [
        { column: 'availment_id', referencesTable: 'availments', referencesColumn: 'id' }
      ],
      projectionOnly: false
    },

    // Phase 11 (11-01, D-07/D-10/D-15): STRICTLY append-only fulfillment
    // event ledger — every progress-stage/courier/payout action writes one
    // row here; availments.fulfillment_mode/fulfillment_status/
    // fulfillment_stage above are a denormalized read cache of the LATEST
    // row, never the source of truth. is_forced records D-10 overrides
    // distinctly and queryably (Open Q2 RESOLVED), separate from the
    // free-text reason.
    availment_stage_events: {
      columns: [
        'id',
        'business_id',
        'availment_id',
        'fulfillment_mode',
        'fulfillment_status',
        'fulfillment_stage',
        'reason',
        'is_forced',
        'actor_staff_account_id',
        'actor_account_id',
        'created_at'
      ],
      indexes: ['idx_availment_stage_events_business_availment'],
      uniqueConstraints: [],
      foreignKeys: [
        { column: 'availment_id', referencesTable: 'availments', referencesColumn: 'id' },
        { column: 'actor_staff_account_id', referencesTable: 'staff_accounts', referencesColumn: 'id' }
      ],
      projectionOnly: false
    },

    // Phase 11 (11-01, D-01/D-02/D-03/D-04, Landmine 3/A5): DELIBERATELY
    // MUTABLE payout sub-lifecycle (payout_status owed->paid, paid_at,
    // updated_at) — the ONLY commerce table in this contract with a mutable
    // payout column and NO append-only trigger. Reassignment history is
    // preserved via is_active/superseded_at (D-04): a new attempt inserts a
    // new row and marks the prior inactive, never overwriting or deleting.
    // Independent of Phase 8 shift/cash-drawer pay-outs (D-03) — no FK to
    // shifts/cash_drawer_events.
    courier_assignments: {
      columns: [
        'id',
        'business_id',
        'availment_id',
        'courier_name',
        'courier_contact',
        'payout_amount',
        'payout_status',
        'paid_at',
        'is_active',
        'superseded_at',
        'assigned_by_staff_account_id',
        'created_at',
        'updated_at'
      ],
      indexes: ['idx_courier_assignments_business_availment'],
      uniqueConstraints: [],
      foreignKeys: [
        { column: 'availment_id', referencesTable: 'availments', referencesColumn: 'id' },
        { column: 'assigned_by_staff_account_id', referencesTable: 'staff_accounts', referencesColumn: 'id' }
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
