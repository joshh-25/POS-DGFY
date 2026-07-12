'use strict';

/**
 * Phase 08 gap-closure (08-09-PLAN.md, CR-01/FSC-01): makes the
 * "one compliance_mode_state row per (business_id, branch_id)" invariant
 * DB-enforceable even when branch_id IS NULL (the common "business-wide, no
 * branch scope" case).
 *
 * The original unique index shipped by
 * 20260712100000-create-commerce-foundation.cjs
 * (`unique_compliance_mode_state_business_branch` on
 * (business_id, branch_id)) does NOT enforce uniqueness when branch_id IS
 * NULL, because MySQL/InnoDB treats every NULL value in a unique index as
 * distinct from every other NULL — two concurrent inserts for the same
 * business with branch_id = NULL both succeed. This is a SEPARATE, additive
 * forward-dated migration rather than an edit to the already-shipped
 * 20260712100000 migration, which stays untouched (idempotent-rerun safety
 * for every already-migrated dgfy_business_* database, matching the
 * established precedent set by 20260711143000-add-dgfy-business-staff-
 * invitations.cjs).
 *
 * Fix: add a STORED generated column `branch_scope_key` =
 * COALESCE(branch_id, 0), mirroring the exact pattern this phase's own
 * `shifts.active_terminal_cashier_key` generated column already uses (see
 * 20260712100000-create-commerce-foundation.cjs's shifts block), then put
 * the real unique index on (business_id, branch_scope_key) instead of
 * (business_id, branch_id).
 *
 * A `branch_id = 0` sentinel value (in place of NULL) was considered and
 * REJECTED — branch_id has a real FK into `locations.id`, and 0 is never a
 * valid locations.id, so writing a literal 0 into branch_id would violate
 * that FK constraint. COALESCE-ing to 0 only inside a derived, DB-generated
 * column sidesteps this: branch_id itself stays nullable with its FK intact,
 * while branch_scope_key gives MySQL a value it CAN enforce uniqueness
 * against (0 collapses every NULL branch_id to the same deterministic key
 * for a given business_id, so a second NULL-branch row for the same
 * business_id now collides on the unique index instead of silently
 * inserting).
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
      'Removes the compliance_mode_state.branch_scope_key generated column and its unique index, ' +
      'restoring the original unique_compliance_mode_state_business_branch index on ' +
      '(business_id, branch_id) — additive Phase 08 gap-closure only, no other table is touched.',
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

    // 1. Drop the old plain unique index — it cannot enforce the invariant
    //    for branch_id IS NULL, so it is superseded by
    //    unique_compliance_mode_state_business_branch_scope below.
    if (await hasIndex('compliance_mode_state', 'unique_compliance_mode_state_business_branch')) {
      await queryInterface.removeIndex('compliance_mode_state', 'unique_compliance_mode_state_business_branch');
    }

    // 2. Add the STORED generated column, mirroring shifts.
    //    active_terminal_cashier_key exactly (see
    //    20260712100000-create-commerce-foundation.cjs).
    const complianceModeStateDescription = await queryInterface.describeTable('compliance_mode_state');
    if (!complianceModeStateDescription.branch_scope_key) {
      await queryInterface.sequelize.query(`
        ALTER TABLE compliance_mode_state
        ADD COLUMN branch_scope_key INTEGER
        GENERATED ALWAYS AS (COALESCE(branch_id, 0)) STORED
      `);
    }

    // 3. Add the new unique index the generated column backs.
    await addIndexIfMissing('compliance_mode_state', ['business_id', 'branch_scope_key'], {
      name: 'unique_compliance_mode_state_business_branch_scope',
      unique: true
    });
  },

  async down(queryInterface, Sequelize) {
    try {
      await queryInterface.removeIndex('compliance_mode_state', 'unique_compliance_mode_state_business_branch_scope');
    } catch {
      // index may not exist — safe no-op on reverse of a partial/no-op up()
    }

    try {
      const complianceModeStateDescription = await queryInterface.describeTable('compliance_mode_state');
      if (complianceModeStateDescription.branch_scope_key) {
        await queryInterface.removeColumn('compliance_mode_state', 'branch_scope_key');
      }
    } catch {
      // table may not exist — safe no-op
    }

    const hasIndex = async (tableName, indexName) => {
      try {
        const indexes = await queryInterface.showIndex(tableName);
        return (indexes || []).some((index) => String(index.name).toLowerCase() === String(indexName).toLowerCase());
      } catch {
        return false;
      }
    };

    if (!await hasIndex('compliance_mode_state', 'unique_compliance_mode_state_business_branch')) {
      await queryInterface.addIndex('compliance_mode_state', ['business_id', 'branch_id'], {
        name: 'unique_compliance_mode_state_business_branch',
        unique: true
      });
    }
  }
};
