'use strict';

/**
 * Phase 10 Plan 07: cross-DB idempotency guard for the storefront-order ->
 * tenant-Availment finalize seam (RESEARCH Pitfall 2, T-10-07-01).
 *
 * Adds a nullable `source_reference` STRING(64) column + UNIQUE index
 * (`unique_availments_source_reference`) to the tenant `availments` table.
 * This is the belt-and-suspenders (c) guard from RESEARCH Pitfall 2: even a
 * lost-guard duplicate-webhook/duplicate-finalize race (two concurrent calls
 * both miss the row-locked lookup and both attempt an insert) collapses to
 * one Availment row, because MySQL enforces the unique index and the loser's
 * insert throws SequelizeUniqueConstraintError. POS/Phase-9 availments never
 * set this column, so it stays NULL for every existing row — MySQL's unique
 * index permits multiple NULLs, so this is a fully additive, non-breaking
 * change for the existing POS finalize path.
 *
 * Also adds a nullable `payment_reference` STRING(191) column to the tenant
 * `payments` table (Rule 2 gap-closure, not in the plan's original file list
 * but required by the plan's own behavior text and threat register
 * T-10-07-04: "the PayMongo pay-reference stored in a reference field/
 * metadata" — the Payment model had no such column before this migration,
 * so a payment_method-ENUM-mapped GCash/Card storefront payment had nowhere
 * to durably record the actual PayMongo `pay_...` id it corresponds to).
 * Both columns are additive/nullable and touch no existing data.
 *
 * Also fills a PRE-EXISTING Phase 9 schema-contract gap discovered while
 * implementing this task: `dgfyBusinessContract.js` never gained `availments`
 * / `availment_items` / `availment_discounts` / `payments` / `receipts` /
 * `compliance_evidence` table entries despite 09-01-SUMMARY.md claiming they
 * were added (git history shows no Phase 9 commit ever touched that file —
 * the entries were apparently lost from an uncommitted working tree, per
 * 42ae30f4's "catch-up commit" message). This migration's own two touched
 * tables (`availments`, `payments`) are added to the contract here so the
 * new `source_reference`/`payment_reference` columns are actually verifiable
 * by migration-runner's `verify` command; the other four still-missing
 * tables are OUT OF SCOPE for this plan and are logged in deferred-items.md.
 *
 * `meta.targetKind: 'business'` scopes this migration to `dgfy_business_*`
 * targets only, matching every other migration in this schema family. All
 * operations are guarded with existence checks so re-running this migration
 * against an already-migrated `dgfy_business_*` database is a no-op.
 */

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  meta: {
    destructive: false,
    targetKind: 'business',
    rollbackDescription:
      'Drops availments.source_reference (+ its unique index) and payments.payment_reference — ' +
      'additive Phase 10 storefront-finalize idempotency/audit columns only, no other tenant table is touched.',
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

    // --- availments.source_reference (cross-DB idempotency guard) ---------
    const availmentsDescription = await queryInterface.describeTable('availments');
    if (!availmentsDescription.source_reference) {
      await queryInterface.addColumn('availments', 'source_reference', {
        type: Sequelize.STRING(64),
        allowNull: true
      });
    }
    await addIndexIfMissing('availments', ['source_reference'], {
      name: 'unique_availments_source_reference',
      unique: true
    });

    // --- payments.payment_reference (T-10-07-04 pay-reference storage) ----
    const paymentsDescription = await queryInterface.describeTable('payments');
    if (!paymentsDescription.payment_reference) {
      await queryInterface.addColumn('payments', 'payment_reference', {
        type: Sequelize.STRING(191),
        allowNull: true
      });
    }
  },

  async down(queryInterface) {
    try {
      if (await (async () => {
        try {
          const indexes = await queryInterface.showIndex('availments');
          return (indexes || []).some((index) => String(index.name).toLowerCase() === 'unique_availments_source_reference');
        } catch {
          return false;
        }
      })()) {
        await queryInterface.removeIndex('availments', 'unique_availments_source_reference');
      }
    } catch {
      // index may not exist — safe no-op
    }

    try {
      const availmentsDescription = await queryInterface.describeTable('availments');
      if (availmentsDescription.source_reference) {
        await queryInterface.removeColumn('availments', 'source_reference');
      }
    } catch {
      // table may not exist — safe no-op
    }

    try {
      const paymentsDescription = await queryInterface.describeTable('payments');
      if (paymentsDescription.payment_reference) {
        await queryInterface.removeColumn('payments', 'payment_reference');
      }
    } catch {
      // table may not exist — safe no-op
    }
  }
};
