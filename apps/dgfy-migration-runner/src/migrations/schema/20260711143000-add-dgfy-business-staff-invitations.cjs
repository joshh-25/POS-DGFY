'use strict';

/**
 * Wave 7 gap-closure (04-07-PLAN.md, API-02/API-04 staff durability gap):
 * additive `staff_invitations` table for the `dgfy_business_<stable_opaque_
 * suffix>` tenant foundation.
 *
 * Implements dgfyBusinessContract.js's new `staff_invitations` entry. This is
 * a SEPARATE, additive migration from the original Phase 02 foundation
 * migration (20260710021000-create-dgfy-business-foundation.cjs) — that file
 * is left unchanged; `staff_invitations` did not exist when it was written
 * and 04-VERIFICATION.md's staff durability gap is closed here instead of by
 * editing an already-applied historical migration (DBF-04/idempotent-rerun
 * safety would otherwise be violated for every already-migrated
 * dgfy_business_* database).
 *
 * `meta.targetKind: 'business'` scopes this migration to `dgfy_business_*`
 * targets only (never dgfy_core or any legacy schema), mirroring the
 * foundation migration's own scoping. All operations use QueryInterface with
 * existence guards so re-running this migration against an
 * already-migrated `dgfy_business_*` database is a no-op (DBF-04).
 *
 * SECURITY (T-04-07-02): only `token_hash` is persisted — no column stores a
 * raw invitation token.
 */

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  meta: {
    destructive: false,
    targetKind: 'business',
    rollbackDescription:
      'Drops the dgfy_business_* tenant staff_invitations table — additive Wave 7 gap-closure ' +
      'only, no other tenant foundation table is touched.',
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

    if (!await tableExists('staff_invitations')) {
      await queryInterface.createTable('staff_invitations', {
        id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
        staff_account_id: {
          type: Sequelize.INTEGER,
          allowNull: true,
          references: { model: 'staff_accounts', key: 'id' },
          onDelete: 'SET NULL',
          onUpdate: 'CASCADE'
        },
        email: { type: Sequelize.STRING(255), allowNull: false },
        // SHA-256 hex digest of the raw invitation token — never the raw
        // token itself (T-04-07-02).
        token_hash: { type: Sequelize.STRING(255), allowNull: false },
        status: {
          type: Sequelize.ENUM('pending', 'accepted', 'expired', 'revoked'),
          allowNull: false,
          defaultValue: 'pending'
        },
        expires_at: { type: Sequelize.DATE, allowNull: false },
        accepted_at: { type: Sequelize.DATE, allowNull: true },
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
    }

    await addIndexIfMissing('staff_invitations', ['token_hash'], {
      name: 'unique_staff_invitations_token_hash',
      unique: true
    });
    await addIndexIfMissing('staff_invitations', ['email'], {
      name: 'idx_staff_invitations_email'
    });
    await addIndexIfMissing('staff_invitations', ['status'], {
      name: 'idx_staff_invitations_status'
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('staff_invitations');

    if (queryInterface.sequelize && queryInterface.sequelize.getDialect() === 'mysql') {
      await queryInterface.sequelize.query('DROP TYPE IF EXISTS enum_staff_invitations_status').catch(() => {});
    }
  }
};
