'use strict';

/**
 * Phase 08 Plan 01: Commerce Domain foundation — the authoritative
 * tenant-schema migration for Product Catalog, Booking, Shift & Cash
 * Drawer, and Compliance-Mode state (PRD-01..05, BOK-01..03, SFT-01..03,
 * FSC-01/02).
 *
 * `meta.targetKind: 'business'` structurally excludes this migration from
 * any run against `dgfy_core` or any other non-business target — it only
 * ever applies to a `dgfy_business_*` tenant database, exactly like
 * `20260710021000-create-dgfy-business-foundation.cjs`, whose idempotent
 * helper shape (`tableExists`/`hasIndex`/`addIndexIfMissing`/
 * `timestampColumns()`) this file copies verbatim.
 *
 * Creates 8 new tenant-local tables:
 *   product_folders, products, inventory_movements, bookings,
 *   booking_capacity, shifts, cash_drawer_events, compliance_mode_state
 *
 * DB-level integrity guarantees encoded here (not just app-layer
 * conventions):
 *   - inventory_movements / cash_drawer_events are append-only: BEFORE
 *     UPDATE / BEFORE DELETE triggers SIGNAL SQLSTATE '45000' (ported from
 *     backend/migrations/20260408000003-harden-compliance-audit-immutability.cjs,
 *     read-only pattern source).
 *   - shifts carries a MySQL GENERATED ALWAYS AS (...) STORED column
 *     (`active_terminal_cashier_key`) + a UNIQUE INDEX
 *     (`uq_shifts_active_terminal_cashier`) enforcing one open shift per
 *     (terminal_id, cashier_account_id) at the DB layer (D-12/D-13, ported
 *     from backend/migrations/20260703000002-enforce-one-open-shift-per-terminal.cjs,
 *     read-only pattern source, extended to a composite key).
 *
 * Cross-database references (business_id, customer_account_id,
 * cashier_dgfy_account_id, actor_account_id) are opaque CHAR(36) UUID
 * columns with NO foreignKey — MySQL cannot enforce a foreign key across
 * two separate databases. Same-DB FKs (product_id -> products.id,
 * folder_id -> product_folders.id, branch_id -> locations.id,
 * terminal_id -> terminal_identities.id, cashier_account_id ->
 * staff_accounts.id, shift_id -> shifts.id, actor_staff_account_id ->
 * staff_accounts.id) use INTEGER autoincrement PKs to match the existing
 * tenant-table convention (locations.id, staff_accounts.id,
 * terminal_identities.id are all INTEGER).
 *
 * The ledger table is named `inventory_movements`, NEVER `stock_movements`
 * (that legacy IMS name stays in dgfyBusinessContract.js's rejectedTables —
 * see Pitfall 1 in 08-RESEARCH.md). `stock_effect_type` is deliberately NOT
 * added to `products` (D-07 — it lives on AvailmentItem, Phase 9).
 * `movement_type` reserves (unwired) `sale`/`booking` values and
 * `event_type` reserves (unwired) `pay_in`/`pay_out` values per D-06/D-10.
 *
 * Zero backend/ writes: every backend/ file cited above is a read-only
 * pattern-porting source. No new table declares a foreign key into legacy
 * `items`/`PosTransactionLine`.
 */

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  meta: {
    destructive: false,
    targetKind: 'business',
    rollbackDescription:
      'Drops the Commerce Domain foundation tables (product_folders, products, ' +
      'inventory_movements, bookings, booking_capacity, shifts, cash_drawer_events, ' +
      'compliance_mode_state) plus their append-only triggers and the shifts ' +
      'generated-column unique index — additive Phase 08 commerce foundation only, ' +
      'no legacy sku_* schema and no other dgfy_business_* table is touched.',
    estimatedRisk: 'low'
  },

  async up(queryInterface, Sequelize) {
    const tableExists = async (tableName) => {
      const tables = await queryInterface.showAllTables();
      return (tables || []).some((entry) => {
        const value = typeof entry === 'string' ? entry : (entry?.tableName || entry?.table_name || String(entry));
        return String(value).toLowerCase() === String(tableName).toLowerCase();
      });
    };

    const hasIndex = async (tableName, indexName) => {
      try {
        const indexes = await queryInterface.showIndex(tableName);
        return (indexes || []).some((index) => String(index.name).toLowerCase() === String(indexName).toLowerCase());
      } catch {
        return false;
      }
    };

    const addIndexIfMissing = async (tableName, columns, options = {}) => {
      if (options.name && await hasIndex(tableName, options.name)) return;
      await queryInterface.addIndex(tableName, columns, options);
    };

    const timestampColumns = () => ({
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
      },
      updated_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
      }
    });

    // --- product_folders (PRD-03, D-14: flat, no parent_id nesting) ---------
    if (!await tableExists('product_folders')) {
      await queryInterface.createTable('product_folders', {
        id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
        // Opaque UUID pointing at dgfy_core.businesses.id — never a real FK
        // (cross-database).
        business_id: { type: Sequelize.CHAR(36), allowNull: false },
        name: { type: Sequelize.STRING(100), allowNull: false },
        description: { type: Sequelize.TEXT, allowNull: true },
        show_in_pos_filter: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true },
        is_active: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true },
        ...timestampColumns()
      });
    }
    await addIndexIfMissing('product_folders', ['business_id', 'name'], {
      name: 'unique_product_folders_business_name',
      unique: true
    });

    // --- products (PRD-01/PRD-02, D-07: no stock_effect_type here) ----------
    if (!await tableExists('products')) {
      await queryInterface.createTable('products', {
        id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
        // Opaque UUID pointing at dgfy_core.businesses.id — never a real FK
        // (cross-database).
        business_id: { type: Sequelize.CHAR(36), allowNull: false },
        folder_id: {
          type: Sequelize.INTEGER,
          allowNull: true,
          references: { model: 'product_folders', key: 'id' },
          onDelete: 'SET NULL',
          onUpdate: 'CASCADE'
        },
        name: { type: Sequelize.STRING(255), allowNull: false },
        category: {
          type: Sequelize.ENUM('food', 'service', 'retail'),
          allowNull: false
        },
        inventory_mode: {
          type: Sequelize.ENUM('basic_inventory', 'non_stock'),
          allowNull: false,
          defaultValue: 'non_stock'
        },
        stock_count: { type: Sequelize.DECIMAL(24, 12), allowNull: true },
        base_price: { type: Sequelize.DECIMAL(14, 4), allowNull: true },
        is_bookable: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
        slot_duration_minutes: { type: Sequelize.INTEGER, allowNull: true },
        concurrent_capacity: { type: Sequelize.INTEGER, allowNull: true },
        is_active: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true },
        ...timestampColumns()
      });
    }
    await addIndexIfMissing('products', ['business_id'], { name: 'idx_products_business' });
    await addIndexIfMissing('products', ['folder_id'], { name: 'idx_products_folder' });
    await addIndexIfMissing('products', ['category'], { name: 'idx_products_category' });

    // --- inventory_movements (PRD-04 — sole writer: modules/inventory, ------
    // ADR 0029; append-only, NEVER named stock_movements — Pitfall 1) -------
    if (!await tableExists('inventory_movements')) {
      await queryInterface.createTable('inventory_movements', {
        id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
        // Opaque UUID pointing at dgfy_core.businesses.id — never a real FK
        // (cross-database).
        business_id: { type: Sequelize.CHAR(36), allowNull: false },
        product_id: {
          type: Sequelize.INTEGER,
          allowNull: false,
          references: { model: 'products', key: 'id' },
          onDelete: 'CASCADE',
          onUpdate: 'CASCADE'
        },
        // sale/booking are reserved, unwired effect-type stubs (D-06) — only
        // restock/loss/adjustment are written by this phase's usecases.
        movement_type: {
          type: Sequelize.ENUM('restock', 'loss', 'adjustment', 'sale', 'booking'),
          allowNull: false
        },
        quantity: { type: Sequelize.DECIMAL(24, 12), allowNull: false },
        reference_type: { type: Sequelize.STRING(64), allowNull: true },
        reference_id: { type: Sequelize.STRING(64), allowNull: true },
        // Opaque UUID pointing at dgfy_core.accounts.id — never a real FK
        // (cross-database).
        actor_account_id: { type: Sequelize.CHAR(36), allowNull: true },
        actor_staff_account_id: {
          type: Sequelize.INTEGER,
          allowNull: true,
          references: { model: 'staff_accounts', key: 'id' },
          onDelete: 'SET NULL',
          onUpdate: 'CASCADE'
        },
        before_snapshot: { type: Sequelize.JSON, allowNull: true },
        after_snapshot: { type: Sequelize.JSON, allowNull: true },
        // Append-only: created_at ONLY, no updated_at column.
        created_at: {
          type: Sequelize.DATE,
          allowNull: false,
          defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
        }
      });
    }
    await addIndexIfMissing('inventory_movements', ['business_id', 'product_id'], {
      name: 'idx_inventory_movements_business_product'
    });
    await addIndexIfMissing('inventory_movements', ['movement_type'], {
      name: 'idx_inventory_movements_movement_type'
    });

    // --- bookings (BOK-01/BOK-02/BOK-03) ------------------------------------
    if (!await tableExists('bookings')) {
      await queryInterface.createTable('bookings', {
        id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
        // Opaque UUID pointing at dgfy_core.businesses.id — never a real FK
        // (cross-database).
        business_id: { type: Sequelize.CHAR(36), allowNull: false },
        product_id: {
          type: Sequelize.INTEGER,
          allowNull: false,
          references: { model: 'products', key: 'id' },
          onDelete: 'CASCADE',
          onUpdate: 'CASCADE'
        },
        branch_id: {
          type: Sequelize.INTEGER,
          allowNull: false,
          references: { model: 'locations', key: 'id' },
          onDelete: 'CASCADE',
          onUpdate: 'CASCADE'
        },
        // Opaque UUID pointing at dgfy_core.accounts.id — never a real FK
        // (cross-database). D-09: consumer-owns-booking cancel check.
        customer_account_id: { type: Sequelize.CHAR(36), allowNull: true },
        slot_start: { type: Sequelize.DATE, allowNull: false },
        slot_end: { type: Sequelize.DATE, allowNull: true },
        status: {
          type: Sequelize.ENUM('booked', 'cancelled', 'fulfilled'),
          allowNull: false,
          defaultValue: 'booked'
        },
        // Reserved, no FK — the Availment table is Phase 9 (BOK-03).
        availment_id: { type: Sequelize.INTEGER, allowNull: true },
        cancelled_at: { type: Sequelize.DATE, allowNull: true },
        ...timestampColumns()
      });
    }
    await addIndexIfMissing('bookings', ['business_id', 'product_id', 'branch_id', 'slot_start'], {
      name: 'idx_bookings_business_product_branch_slot'
    });
    await addIndexIfMissing('bookings', ['customer_account_id'], {
      name: 'idx_bookings_customer_account'
    });

    // --- booking_capacity (BOK-02 — atomic guarded UPDATE counter) ----------
    if (!await tableExists('booking_capacity')) {
      await queryInterface.createTable('booking_capacity', {
        id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
        // Opaque UUID pointing at dgfy_core.businesses.id — never a real FK
        // (cross-database).
        business_id: { type: Sequelize.CHAR(36), allowNull: false },
        product_id: {
          type: Sequelize.INTEGER,
          allowNull: false,
          references: { model: 'products', key: 'id' },
          onDelete: 'CASCADE',
          onUpdate: 'CASCADE'
        },
        branch_id: {
          type: Sequelize.INTEGER,
          allowNull: false,
          references: { model: 'locations', key: 'id' },
          onDelete: 'CASCADE',
          onUpdate: 'CASCADE'
        },
        slot_start: { type: Sequelize.DATE, allowNull: false },
        slots_remaining: { type: Sequelize.INTEGER, allowNull: false },
        ...timestampColumns()
      });
    }
    await addIndexIfMissing('booking_capacity', ['product_id', 'branch_id', 'slot_start'], {
      name: 'unique_booking_capacity_product_branch_slot',
      unique: true
    });

    // --- shifts (SFT-01/SFT-02, D-12/D-13: one-open-shift generated column) -
    if (!await tableExists('shifts')) {
      await queryInterface.createTable('shifts', {
        id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
        // Opaque UUID pointing at dgfy_core.businesses.id — never a real FK
        // (cross-database).
        business_id: { type: Sequelize.CHAR(36), allowNull: false },
        // RESTRICT (not CASCADE): this column is the base column of the
        // active_terminal_cashier_key STORED generated column below. MySQL
        // 8.0 forbids CASCADE/SET NULL/SET DEFAULT (in either ON UPDATE or
        // ON DELETE) on a foreign key whose column feeds a STORED generated
        // column — see MySQL 8.0 Reference Manual, "Generated Columns" and
        // "Foreign Key Constraints" (error 1215 otherwise).
        terminal_id: {
          type: Sequelize.INTEGER,
          allowNull: false,
          references: { model: 'terminal_identities', key: 'id' },
          onDelete: 'RESTRICT',
          onUpdate: 'RESTRICT'
        },
        // D-13: tenant-local staff_accounts.id (INTEGER), NOT the landlord
        // dgfy_account_id (UUID) — keeps the one-open-shift key same-DB.
        // RESTRICT (not CASCADE): also a base column of
        // active_terminal_cashier_key — same MySQL generated-column
        // restriction as terminal_id above.
        cashier_account_id: {
          type: Sequelize.INTEGER,
          allowNull: false,
          references: { model: 'staff_accounts', key: 'id' },
          onDelete: 'RESTRICT',
          onUpdate: 'RESTRICT'
        },
        // Opaque UUID pointing at dgfy_core.accounts.id — never a real FK
        // (cross-database); kept alongside for audit only (D-13).
        cashier_dgfy_account_id: { type: Sequelize.CHAR(36), allowNull: true },
        status: {
          type: Sequelize.ENUM('open', 'closed'),
          allowNull: false,
          defaultValue: 'open'
        },
        opening_float_amount: { type: Sequelize.DECIMAL(14, 4), allowNull: false },
        expected_cash_amount: { type: Sequelize.DECIMAL(14, 4), allowNull: true },
        closing_cash_amount: { type: Sequelize.DECIMAL(14, 4), allowNull: true },
        cash_variance_amount: { type: Sequelize.DECIMAL(14, 4), allowNull: true },
        opened_at: { type: Sequelize.DATE, allowNull: false },
        closed_at: { type: Sequelize.DATE, allowNull: true },
        ...timestampColumns()
      });
    }

    // D-12/D-13 (Pattern B): MySQL generated-column + unique-index one-open-
    // shift invariant, extended to a composite (terminal_id,
    // cashier_account_id) key — ported from
    // backend/migrations/20260703000002-enforce-one-open-shift-per-terminal.cjs
    // (read-only pattern source).
    {
      const shiftsTableDescription = await queryInterface.describeTable('shifts');
      if (!shiftsTableDescription.active_terminal_cashier_key) {
        await queryInterface.sequelize.query(`
          ALTER TABLE shifts
          ADD COLUMN active_terminal_cashier_key VARCHAR(150)
          GENERATED ALWAYS AS (
            CASE WHEN status = 'open'
              THEN CONCAT_WS('|', terminal_id, cashier_account_id)
              ELSE NULL END
          ) STORED
        `);
      }
    }
    await addIndexIfMissing('shifts', ['active_terminal_cashier_key'], {
      name: 'uq_shifts_active_terminal_cashier',
      unique: true
    });

    // --- cash_drawer_events (SFT-03 — append-only; pay_in/pay_out reserved) -
    if (!await tableExists('cash_drawer_events')) {
      await queryInterface.createTable('cash_drawer_events', {
        id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
        // Opaque UUID pointing at dgfy_core.businesses.id — never a real FK
        // (cross-database).
        business_id: { type: Sequelize.CHAR(36), allowNull: false },
        shift_id: {
          type: Sequelize.INTEGER,
          allowNull: false,
          references: { model: 'shifts', key: 'id' },
          onDelete: 'CASCADE',
          onUpdate: 'CASCADE'
        },
        // pay_in/pay_out are reserved, unwired event types (D-10) — only
        // open/close/no_sale_pop are written by this phase's usecases.
        event_type: {
          type: Sequelize.ENUM('open', 'close', 'no_sale_pop', 'pay_in', 'pay_out'),
          allowNull: false
        },
        amount: { type: Sequelize.DECIMAL(14, 4), allowNull: true },
        reason: { type: Sequelize.STRING(255), allowNull: true },
        actor_staff_account_id: {
          type: Sequelize.INTEGER,
          allowNull: true,
          references: { model: 'staff_accounts', key: 'id' },
          onDelete: 'SET NULL',
          onUpdate: 'CASCADE'
        },
        // Append-only: created_at ONLY, no updated_at column.
        created_at: {
          type: Sequelize.DATE,
          allowNull: false,
          defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
        }
      });
    }
    await addIndexIfMissing('cash_drawer_events', ['shift_id'], {
      name: 'idx_cash_drawer_events_shift'
    });
    await addIndexIfMissing('cash_drawer_events', ['event_type'], {
      name: 'idx_cash_drawer_events_event_type'
    });

    // --- compliance_mode_state (FSC-01/FSC-02, D-01..D-05) ------------------
    if (!await tableExists('compliance_mode_state')) {
      await queryInterface.createTable('compliance_mode_state', {
        id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
        // Opaque UUID pointing at dgfy_core.businesses.id — never a real FK
        // (cross-database). D-01: tenant-scoped, not dgfy_core.
        business_id: { type: Sequelize.CHAR(36), allowNull: false },
        // RESTRICT (not CASCADE): this column is the base column of the
        // branch_scope_key STORED generated column added by
        // 20260712140000-harden-compliance-mode-state-uniqueness.cjs. MySQL
        // 8.0 forbids CASCADE/SET NULL/SET DEFAULT (in either ON UPDATE or
        // ON DELETE) on a foreign key whose column feeds a STORED generated
        // column — see MySQL 8.0 Reference Manual, "Generated Columns" and
        // "Foreign Key Constraints" (error 1215 otherwise).
        branch_id: {
          type: Sequelize.INTEGER,
          allowNull: true,
          references: { model: 'locations', key: 'id' },
          onDelete: 'RESTRICT',
          onUpdate: 'RESTRICT'
        },
        // D-02: full port of legacy's 3-state COMPLIANCE_MODE_STATE model.
        state: {
          type: Sequelize.ENUM('non_compliant_active', 'compliant_pending', 'compliant_active'),
          allowNull: false,
          defaultValue: 'non_compliant_active'
        },
        // D-03: versioned BIR/NPC/BSP policy-pack profile fields/artifacts.
        compliance_profile: { type: Sequelize.JSON, allowNull: true },
        active_policy_pack_version: { type: Sequelize.STRING(32), allowNull: true },
        // D-04: manual review — verification_status/verified_by_actor_type
        // mirror legacy's COMPLIANCE_VERIFICATION_STATUS /
        // COMPLIANCE_VERIFIER_ACTOR_TYPE enums.
        verification_status: {
          type: Sequelize.ENUM('pending_review', 'verified', 'rejected', 'revoked'),
          allowNull: true
        },
        verified_by_actor_type: {
          type: Sequelize.ENUM('tenant_master_admin', 'platform_admin'),
          allowNull: true
        },
        verified_at: { type: Sequelize.DATE, allowNull: true },
        ...timestampColumns()
      });
    }
    await addIndexIfMissing('compliance_mode_state', ['business_id', 'branch_id'], {
      name: 'unique_compliance_mode_state_business_branch',
      unique: true
    });

    // --- Append-only triggers (PRD-04/SFT-03) — ported from -----------------
    // backend/migrations/20260408000003-harden-compliance-audit-immutability.cjs
    // (read-only pattern source). DROP TRIGGER IF EXISTS precedes each
    // CREATE TRIGGER for idempotency.
    const appendOnlyTables = ['inventory_movements', 'cash_drawer_events'];
    for (const tableName of appendOnlyTables) {
      // eslint-disable-next-line no-await-in-loop
      await queryInterface.sequelize.query(`DROP TRIGGER IF EXISTS trg_${tableName}_append_only_update`);
      // eslint-disable-next-line no-await-in-loop
      await queryInterface.sequelize.query(`DROP TRIGGER IF EXISTS trg_${tableName}_append_only_delete`);

      // eslint-disable-next-line no-await-in-loop
      await queryInterface.sequelize.query(`
        CREATE TRIGGER trg_${tableName}_append_only_update
        BEFORE UPDATE ON ${tableName}
        FOR EACH ROW
        BEGIN
          SIGNAL SQLSTATE '45000'
          SET MESSAGE_TEXT = '${tableName} is append-only and cannot be updated';
        END
      `);

      // eslint-disable-next-line no-await-in-loop
      await queryInterface.sequelize.query(`
        CREATE TRIGGER trg_${tableName}_append_only_delete
        BEFORE DELETE ON ${tableName}
        FOR EACH ROW
        BEGIN
          SIGNAL SQLSTATE '45000'
          SET MESSAGE_TEXT = '${tableName} is append-only and cannot be deleted';
        END
      `);
    }
  },

  async down(queryInterface) {
    const appendOnlyTables = ['inventory_movements', 'cash_drawer_events'];
    for (const tableName of appendOnlyTables) {
      // eslint-disable-next-line no-await-in-loop
      await queryInterface.sequelize.query(`DROP TRIGGER IF EXISTS trg_${tableName}_append_only_update`);
      // eslint-disable-next-line no-await-in-loop
      await queryInterface.sequelize.query(`DROP TRIGGER IF EXISTS trg_${tableName}_append_only_delete`);
    }

    try {
      await queryInterface.removeIndex('shifts', 'uq_shifts_active_terminal_cashier');
    } catch {
      // index may not exist — safe no-op on reverse of a partial/no-op up()
    }
    try {
      const shiftsTableDescription = await queryInterface.describeTable('shifts');
      if (shiftsTableDescription.active_terminal_cashier_key) {
        await queryInterface.removeColumn('shifts', 'active_terminal_cashier_key');
      }
    } catch {
      // table may not exist — safe no-op
    }

    // Reverse dependency order.
    await queryInterface.dropTable('cash_drawer_events');
    await queryInterface.dropTable('shifts');
    await queryInterface.dropTable('booking_capacity');
    await queryInterface.dropTable('bookings');
    await queryInterface.dropTable('inventory_movements');
    await queryInterface.dropTable('products');
    await queryInterface.dropTable('product_folders');
    await queryInterface.dropTable('compliance_mode_state');

    if (queryInterface.sequelize && queryInterface.sequelize.getDialect() === 'mysql') {
      await queryInterface.sequelize.query('DROP TYPE IF EXISTS enum_products_category').catch(() => {});
      await queryInterface.sequelize.query('DROP TYPE IF EXISTS enum_products_inventory_mode').catch(() => {});
      await queryInterface.sequelize.query('DROP TYPE IF EXISTS enum_inventory_movements_movement_type').catch(() => {});
      await queryInterface.sequelize.query('DROP TYPE IF EXISTS enum_bookings_status').catch(() => {});
      await queryInterface.sequelize.query('DROP TYPE IF EXISTS enum_shifts_status').catch(() => {});
      await queryInterface.sequelize.query('DROP TYPE IF EXISTS enum_cash_drawer_events_event_type').catch(() => {});
      await queryInterface.sequelize.query('DROP TYPE IF EXISTS enum_compliance_mode_state_state').catch(() => {});
      await queryInterface.sequelize.query('DROP TYPE IF EXISTS enum_compliance_mode_state_verification_status').catch(() => {});
      await queryInterface.sequelize.query('DROP TYPE IF EXISTS enum_compliance_mode_state_verified_by_actor_type').catch(() => {});
    }
  }
};
