'use strict';

/**
 * Phase 11 Plan 01: Order Fulfillment & Delivery Coordination — the
 * additive, `targetKind: 'business'` tenant-schema migration that lays the
 * two-field event-sourced fulfillment-status foundation (FUL-01..FUL-03).
 *
 * Adds three denormalized read-cache columns to the existing `availments`
 * table (`fulfillment_mode`, `fulfillment_status`, `fulfillment_stage`) —
 * additive/nullable, no backfill of pre-existing rows (A4) — and never
 * touches the existing `status` ENUM (draft/finalized/voided checkout
 * lifecycle, Landmine 1: `fulfillment_status` is a DISTINCT coarse pipeline
 * field, not a rename/reuse of `status`).
 *
 * Creates two new tenant-local tables:
 *   - `availment_stage_events` — STRICTLY append-only event ledger (D-07):
 *     `created_at` only, no `updated_at`, BEFORE UPDATE/DELETE
 *     SIGNAL SQLSTATE '45000' triggers (same pattern as Phase 9's
 *     `payments`/`receipts` and Phase 8's `inventory_movements`). Records
 *     `is_forced` (D-10 override flag) distinctly and queryably alongside
 *     the free-text `reason`.
 *   - `courier_assignments` — deliberately MUTABLE payout sub-lifecycle
 *     (Landmine 3/A5): `payout_status` (owed→paid), `paid_at`, and a full
 *     `updated_at` column. NO append-only trigger — this table is
 *     EXCLUDED from `appendOnlyTables` below. Reassignment history is
 *     preserved via `is_active`/`superseded_at` (D-04 — a new attempt
 *     inserts a new row and marks the prior inactive; nothing is
 *     overwritten or deleted). Independent of Phase 8 shift/cash-drawer
 *     pay-outs (D-03) — no reference to `shifts`/`cash_drawer_events`.
 *
 * `meta.targetKind: 'business'` structurally excludes this migration from
 * any run against `dgfy_core` or any other non-business target, matching
 * every other migration in this schema family. The idempotent helper shape
 * (`tableExists`/`hasIndex`/`addIndexIfMissing`/`timestampColumns()`) and
 * the `describeTable`-guarded addColumn pattern are copied verbatim from
 * `20260713120000-create-availment-checkout.cjs` (Analog A) and
 * `20260714103000-add-availment-source-reference.cjs` (Analog B), so
 * re-running this migration against an already-migrated `dgfy_business_*`
 * database is a no-op.
 *
 * Cross-database references (`business_id`, `actor_account_id`) are opaque
 * CHAR(36) UUID columns with NO foreignKey — MySQL cannot enforce a foreign
 * key across two separate databases. Same-DB FKs (`availment_id` ->
 * `availments.id`, `actor_staff_account_id`/`assigned_by_staff_account_id`
 * -> `staff_accounts.id`) use INTEGER autoincrement PKs to match the
 * existing tenant-table convention.
 *
 * Zero backend/ writes: every backend/ file cited in the plan/research is a
 * read-only pattern-porting source. No new table declares a foreign key
 * into legacy `items`/`PosTransactionLine`/`stock_movements`.
 */

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  meta: {
    destructive: false,
    targetKind: 'business',
    rollbackDescription:
      'Removes the three fulfillment_mode/fulfillment_status/fulfillment_stage columns from ' +
      'availments and drops the availment_stage_events and courier_assignments tables plus the ' +
      'availment_stage_events append-only triggers — additive Phase 11 fulfillment-schema ' +
      'foundation only, no other dgfy_business_* table is touched.',
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

    // --- availments: three denormalized read-cache columns (A4: no ---------
    // backfill, additive/nullable; L1: never touch the existing `status`) ---
    const availmentsDescription = await queryInterface.describeTable('availments');
    if (!availmentsDescription.fulfillment_mode) {
      await queryInterface.addColumn('availments', 'fulfillment_mode', {
        type: Sequelize.ENUM('pickup', 'delivery', 'dine_in'),
        allowNull: true
      });
    }
    if (!availmentsDescription.fulfillment_status) {
      await queryInterface.addColumn('availments', 'fulfillment_status', {
        type: Sequelize.ENUM('placed', 'confirmed', 'preparing', 'ready', 'out_for_delivery', 'completed'),
        allowNull: true
      });
    }
    if (!availmentsDescription.fulfillment_stage) {
      // D-15: one shared free-text stage column, no per-mode DB constraint —
      // stage-sequence validation is app-logic only (fulfillmentUseCases.js,
      // Plan 02).
      await queryInterface.addColumn('availments', 'fulfillment_stage', {
        type: Sequelize.STRING(32),
        allowNull: true
      });
    }

    // --- availment_stage_events (D-07: strictly append-only) ---------------
    if (!await tableExists('availment_stage_events')) {
      await queryInterface.createTable('availment_stage_events', {
        id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
        // Opaque UUID pointing at dgfy_core.businesses.id — never a real FK
        // (cross-database).
        business_id: { type: Sequelize.CHAR(36), allowNull: false },
        // Parent Availment reference (same-DB FK).
        availment_id: {
          type: Sequelize.INTEGER,
          allowNull: false,
          references: { model: 'availments', key: 'id' },
          onDelete: 'CASCADE',
          onUpdate: 'CASCADE'
        },
        fulfillment_mode: {
          type: Sequelize.ENUM('pickup', 'delivery', 'dine_in'),
          allowNull: false
        },
        fulfillment_status: {
          type: Sequelize.ENUM('placed', 'confirmed', 'preparing', 'ready', 'out_for_delivery', 'completed'),
          allowNull: false
        },
        // D-15: shared open-string stage label mirroring availments.fulfillment_stage.
        fulfillment_stage: { type: Sequelize.STRING(32), allowNull: true },
        // Domain reason precedent (mirrors cash_drawer_events.reason) + D-10
        // human note accompanying a forced/override transition.
        reason: { type: Sequelize.STRING(255), allowNull: true },
        // D-10 (Open Q2 RESOLVED): overrides recorded distinctly and
        // queryably, not folded into `reason` alone.
        is_forced: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
        actor_staff_account_id: {
          type: Sequelize.INTEGER,
          allowNull: true,
          references: { model: 'staff_accounts', key: 'id' },
          onDelete: 'SET NULL',
          onUpdate: 'CASCADE'
        },
        // Opaque UUID pointing at dgfy_core.accounts.id — never a real FK
        // (cross-database).
        actor_account_id: { type: Sequelize.CHAR(36), allowNull: true },
        // Append-only: created_at ONLY, no updated_at (D-07).
        created_at: timestampColumns().created_at
      });
    }
    await addIndexIfMissing('availment_stage_events', ['business_id', 'availment_id'], {
      name: 'idx_availment_stage_events_business_availment'
    });

    // --- courier_assignments (Landmine 3/A5: deliberately MUTABLE payout) --
    if (!await tableExists('courier_assignments')) {
      await queryInterface.createTable('courier_assignments', {
        id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
        // Opaque UUID pointing at dgfy_core.businesses.id — never a real FK
        // (cross-database).
        business_id: { type: Sequelize.CHAR(36), allowNull: false },
        // Parent Availment reference (same-DB FK).
        availment_id: {
          type: Sequelize.INTEGER,
          allowNull: false,
          references: { model: 'availments', key: 'id' },
          onDelete: 'CASCADE',
          onUpdate: 'CASCADE'
        },
        // D-01: free-text courier columns, no reusable courier entity.
        // Length-bounded per V5.
        courier_name: { type: Sequelize.STRING(255), allowNull: false },
        courier_contact: { type: Sequelize.STRING(255), allowNull: true },
        // D-02: server-validated non-negative — enforced in usecases
        // (Plan 02), not at the DB layer.
        payout_amount: { type: Sequelize.DECIMAL(12, 2), allowNull: true },
        payout_status: {
          type: Sequelize.ENUM('owed', 'paid'),
          allowNull: false,
          defaultValue: 'owed'
        },
        paid_at: { type: Sequelize.DATE, allowNull: true },
        // D-04: reassignment inserts a NEW row and marks the prior attempt
        // inactive — never overwritten or deleted.
        is_active: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true },
        superseded_at: { type: Sequelize.DATE, allowNull: true },
        assigned_by_staff_account_id: {
          type: Sequelize.INTEGER,
          allowNull: true,
          references: { model: 'staff_accounts', key: 'id' },
          onDelete: 'SET NULL',
          onUpdate: 'CASCADE'
        },
        // Full timestampColumns() (created_at AND updated_at) — this table
        // IS mutable (Landmine 3/A5).
        ...timestampColumns()
      });
    }
    await addIndexIfMissing('courier_assignments', ['business_id', 'availment_id'], {
      name: 'idx_courier_assignments_business_availment'
    });

    // --- Append-only triggers (D-07) — availment_stage_events ONLY. --------
    // courier_assignments is DELIBERATELY EXCLUDED so its payout_status/
    // paid_at columns stay updatable (Landmine 3/A5).
    const appendOnlyTables = ['availment_stage_events'];
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
    const appendOnlyTables = ['availment_stage_events'];
    for (const tableName of appendOnlyTables) {
      // eslint-disable-next-line no-await-in-loop
      await queryInterface.sequelize.query(`DROP TRIGGER IF EXISTS trg_${tableName}_append_only_update`);
      // eslint-disable-next-line no-await-in-loop
      await queryInterface.sequelize.query(`DROP TRIGGER IF EXISTS trg_${tableName}_append_only_delete`);
    }

    // Reverse dependency order.
    await queryInterface.dropTable('courier_assignments');
    await queryInterface.dropTable('availment_stage_events');

    try {
      const availmentsDescription = await queryInterface.describeTable('availments');
      if (availmentsDescription.fulfillment_mode) {
        await queryInterface.removeColumn('availments', 'fulfillment_mode');
      }
      if (availmentsDescription.fulfillment_status) {
        await queryInterface.removeColumn('availments', 'fulfillment_status');
      }
      if (availmentsDescription.fulfillment_stage) {
        await queryInterface.removeColumn('availments', 'fulfillment_stage');
      }
    } catch {
      // table may not exist — safe no-op
    }

    if (queryInterface.sequelize && queryInterface.sequelize.getDialect() === 'mysql') {
      await queryInterface.sequelize.query('DROP TYPE IF EXISTS enum_availments_fulfillment_mode').catch(() => {});
      await queryInterface.sequelize.query('DROP TYPE IF EXISTS enum_availments_fulfillment_status').catch(() => {});
      await queryInterface.sequelize.query('DROP TYPE IF EXISTS enum_availment_stage_events_fulfillment_mode').catch(() => {});
      await queryInterface.sequelize.query('DROP TYPE IF EXISTS enum_availment_stage_events_fulfillment_status').catch(() => {});
      await queryInterface.sequelize.query('DROP TYPE IF EXISTS enum_courier_assignments_payout_status').catch(() => {});
    }
  }
};
