'use strict';

/**
 * Phase 14 Plan 01: additive, `targetKind: 'business'` tenant-schema
 * migration that reserves the non-destructive persistence surface required
 * for the legacy `pos_transactions`/`pos_transaction_lines` ->
 * `availments`/`availment_items` sales-history migration (LDM-05, SHM-04).
 *
 * This migration builds ONLY the additive schema — it does not migrate any
 * legacy row, does not wire a mapper, and does not add any live checkout
 * write path. See 14-CONTEXT.md D-14-01/D-14-05/D-14-07/D-14-08/D-14-09.
 *
 * Adds three nullable columns to the existing `availments` table:
 *   - `source_system` STRING(32) — LDM-05: null for every existing/live
 *     row; migration explicitly writes 'legacy_migration'.
 *   - `legacy_snapshot` JSON — D-14-01/D-14-05/D-14-08: allowlisted
 *     unmapped header evidence (unresolvable FK-shaped fields, legacy void
 *     metadata, generic payment-processing detail with no live target
 *     column). Follows the `products.attributes` namespaced-JSON precedent
 *     (Phase 12/13).
 *   - `additional_fees` JSON — D-14-09: flat
 *     `{ service_fee_amount, delivery_fee }` shape, separate from the
 *     general `legacy_snapshot` bucket because it anticipates (but does not
 *     build) a future live-checkout fee capability. Explicitly NOT wired to
 *     any live checkout use case/controller/serializer in this plan.
 *
 * Adds three nullable columns plus one unique index to the existing
 * `availment_items` table (SHM-04):
 *   - `source_system` STRING(32) — line-level provenance, mirrors the new
 *     `availments.source_system` column.
 *   - `source_reference` STRING(64) — namespaced legacy reference
 *     (`legacy_pos_line:<line_id>`), following the exact
 *     `availments.source_reference` pattern from
 *     `20260714103000-add-availment-source-reference.cjs`.
 *   - `legacy_snapshot` JSON — line detail with no first-class target slot
 *     (raw parent/item IDs, UOM, cost, stock-exempt reason, override
 *     evidence, F&B snapshots).
 *   - `unique_availment_items_source_reference` UNIQUE index on
 *     `source_reference` — target-first crash recovery and retry
 *     idempotency for line inserts, mirroring
 *     `unique_availments_source_reference`. MySQL permits multiple NULLs
 *     under a unique index, so this is additive/non-breaking for every
 *     existing POS/Phase-9 availment_items row.
 *
 * `availments.source_reference` and `unique_availments_source_reference`
 * (added by `20260714103000-add-availment-source-reference.cjs`) are NOT
 * touched by this migration.
 *
 * `dgfyBusinessContract.js` is updated in THIS SAME COMMIT (the atomic
 * invariant every prior additive schema-extension migration in this family
 * follows) — the `availments` contract entry gains the three new columns,
 * and a currently-missing full `availment_items` contract entry is added
 * from the physical Phase 9 DDL plus these three Phase 14 columns/index.
 *
 * `meta.targetKind: 'business'` structurally excludes this migration from
 * any run against `dgfy_core` or any other non-business target, matching
 * every other migration in this schema family. The idempotent helper shape
 * (`hasIndex`/`addIndexIfMissing`) and the `describeTable`-guarded
 * addColumn pattern are copied verbatim from
 * `20260714103000-add-availment-source-reference.cjs` and
 * `20260715120000-create-availment-fulfillment.cjs`, so re-running this
 * migration against an already-migrated `dgfy_business_*` database is a
 * no-op.
 *
 * Zero backend/ writes: every backend/ file cited in 14-CONTEXT.md is a
 * read-only pattern-porting source. No live checkout use case, controller,
 * repository payload, or public serializer is modified by this migration.
 * No `rejectedTables`/`OUT_OF_SCOPE_LEGACY_TABLES` allowlist entry is added
 * or touched here.
 */

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  meta: {
    destructive: false,
    targetKind: 'business',
    rollbackDescription:
      'Drops availments.source_system, availments.legacy_snapshot, availments.additional_fees, ' +
      'availment_items.source_system, availment_items.source_reference (+ its unique index ' +
      'unique_availment_items_source_reference), and availment_items.legacy_snapshot — additive ' +
      'Phase 14 sales-history-migration persistence columns only. Does not touch ' +
      'availments.source_reference, unique_availments_source_reference, or any other tenant table.',
    estimatedRisk: 'low'
  },

  async up(queryInterface, Sequelize) {
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

    // --- availments: source_system / legacy_snapshot / additional_fees -----
    const availmentsDescription = await queryInterface.describeTable('availments');
    if (!availmentsDescription.source_system) {
      // LDM-05: null for every existing/live row; migration explicitly
      // writes 'legacy_migration'.
      await queryInterface.addColumn('availments', 'source_system', {
        type: Sequelize.STRING(32),
        allowNull: true
      });
    }
    if (!availmentsDescription.legacy_snapshot) {
      // D-14-01/D-14-05/D-14-08: allowlisted unmapped header evidence
      // (unresolvable FK-shaped fields, legacy void metadata, generic
      // payment-processing detail with no live target column).
      await queryInterface.addColumn('availments', 'legacy_snapshot', {
        type: Sequelize.JSON,
        allowNull: true
      });
    }
    if (!availmentsDescription.additional_fees) {
      // D-14-09: flat { service_fee_amount, delivery_fee } shape, separate
      // additive column — no live checkout write path in this plan.
      await queryInterface.addColumn('availments', 'additional_fees', {
        type: Sequelize.JSON,
        allowNull: true
      });
    }

    // --- availment_items: source_system / source_reference / -------------
    // legacy_snapshot + unique index (SHM-04) ---------------------------
    const availmentItemsDescription = await queryInterface.describeTable('availment_items');
    if (!availmentItemsDescription.source_system) {
      await queryInterface.addColumn('availment_items', 'source_system', {
        type: Sequelize.STRING(32),
        allowNull: true
      });
    }
    if (!availmentItemsDescription.source_reference) {
      // Namespaced legacy reference (legacy_pos_line:<line_id>), mirrors
      // availments.source_reference exactly (20260714103000).
      await queryInterface.addColumn('availment_items', 'source_reference', {
        type: Sequelize.STRING(64),
        allowNull: true
      });
    }
    if (!availmentItemsDescription.legacy_snapshot) {
      await queryInterface.addColumn('availment_items', 'legacy_snapshot', {
        type: Sequelize.JSON,
        allowNull: true
      });
    }
    await addIndexIfMissing('availment_items', ['source_reference'], {
      name: 'unique_availment_items_source_reference',
      unique: true
    });
  },

  async down(queryInterface) {
    try {
      if (await (async () => {
        try {
          const indexes = await queryInterface.showIndex('availment_items');
          return (indexes || []).some((index) => String(index.name).toLowerCase() === 'unique_availment_items_source_reference');
        } catch {
          return false;
        }
      })()) {
        await queryInterface.removeIndex('availment_items', 'unique_availment_items_source_reference');
      }
    } catch {
      // index may not exist — safe no-op
    }

    try {
      const availmentItemsDescription = await queryInterface.describeTable('availment_items');
      if (availmentItemsDescription.legacy_snapshot) {
        await queryInterface.removeColumn('availment_items', 'legacy_snapshot');
      }
      if (availmentItemsDescription.source_reference) {
        await queryInterface.removeColumn('availment_items', 'source_reference');
      }
      if (availmentItemsDescription.source_system) {
        await queryInterface.removeColumn('availment_items', 'source_system');
      }
    } catch {
      // table may not exist — safe no-op
    }

    try {
      const availmentsDescription = await queryInterface.describeTable('availments');
      if (availmentsDescription.additional_fees) {
        await queryInterface.removeColumn('availments', 'additional_fees');
      }
      if (availmentsDescription.legacy_snapshot) {
        await queryInterface.removeColumn('availments', 'legacy_snapshot');
      }
      if (availmentsDescription.source_system) {
        await queryInterface.removeColumn('availments', 'source_system');
      }
    } catch {
      // table may not exist — safe no-op
    }
  }
};
