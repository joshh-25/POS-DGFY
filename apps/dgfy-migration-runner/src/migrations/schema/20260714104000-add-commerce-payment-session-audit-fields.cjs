'use strict';

/**
 * CR-04 fix (10-REVIEW.md, phase 10 code review): `commerce_payment_sessions`
 * (20260714100000-create-storefront-commerce-landlord.cjs) never gained the
 * `provider_event_id`/`failure_reason` columns that
 * finalizePaidOrderUseCases.js and handleWebhookUseCases.js's
 * updateSessionStatus() calls have always attempted to write. Sequelize
 * silently drops unknown keys on `row.update(patch)` (no error raised), so
 * the PayMongo event id intended for replay/audit tracking on `payment.paid`
 * and the human-readable failure reason on `payment.failed`/`qrph.expired`
 * were computed but never actually persisted — a misleading gap for
 * operators investigating a stuck/failed payment via the DB.
 *
 * Adds two nullable, additive columns to the landlord `commerce_payment_
 * sessions` table:
 *   - provider_event_id VARCHAR(191): the PayMongo webhook event id
 *     (`data.id` on the event payload), for replay/audit/dedup tracking.
 *   - failure_reason TEXT: human-readable reason recorded on
 *     payment.failed/qrph.expired (mirrors the existing
 *     manual_resolution_reason column's shape/intent, but distinct: that
 *     column is for the OTHER terminal state,
 *     finalize_failed_manual_resolution_required).
 *
 * Both are nullable and unpopulated for every pre-existing row — fully
 * additive, non-breaking. `meta.targetKind: 'core'` — this migration only
 * applies to the `dgfy_core` landlord database, mirroring
 * 20260714100000-create-storefront-commerce-landlord.cjs's own convention
 * for this table. Guarded with describeTable() checks so re-running against
 * an already-migrated `dgfy_core` is a safe no-op.
 */

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  meta: {
    destructive: false,
    targetKind: 'core',
    rollbackDescription:
      'Drops commerce_payment_sessions.provider_event_id and commerce_payment_sessions.failure_reason — ' +
      'additive Phase 10 CR-04 audit columns only, no other dgfy_core table is touched.',
    estimatedRisk: 'low'
  },

  async up(queryInterface, Sequelize) {
    const description = await queryInterface.describeTable('commerce_payment_sessions');

    if (!description.provider_event_id) {
      await queryInterface.addColumn('commerce_payment_sessions', 'provider_event_id', {
        type: Sequelize.STRING(191),
        allowNull: true
      });
    }

    if (!description.failure_reason) {
      await queryInterface.addColumn('commerce_payment_sessions', 'failure_reason', {
        type: Sequelize.TEXT,
        allowNull: true
      });
    }
  },

  async down(queryInterface) {
    try {
      const description = await queryInterface.describeTable('commerce_payment_sessions');
      if (description.provider_event_id) {
        await queryInterface.removeColumn('commerce_payment_sessions', 'provider_event_id');
      }
      if (description.failure_reason) {
        await queryInterface.removeColumn('commerce_payment_sessions', 'failure_reason');
      }
    } catch {
      // table may not exist — safe no-op
    }
  }
};
