'use strict';

/**
 * Phase 13.5 staff-authentication model correction (STAFF-01):
 * additive `staff_credentials` table for the `dgfy_business_<stable_opaque_
 * suffix>` tenant foundation.
 *
 * This is intentionally a SEPARATE migration from the original Phase 02
 * foundation migration (20260710021000-create-dgfy-business-foundation.cjs).
 * That foundation migration has already been applied on 26 rehearsal tenant
 * databases; editing it would violate DBF-04/idempotent-rerun safety. This
 * migration only adds the tenant-local credential target required by ADR 0028's
 * Phase 13.5 amendment.
 *
 * `meta.targetKind: 'business'` scopes this migration to `dgfy_business_*`
 * targets only (never dgfy_core or any legacy schema). All operations use
 * QueryInterface with existence guards so re-running against an already-migrated
 * tenant database is a no-op.
 *
 * SECURITY (D-13.5-02): this table only stores bcrypt hashes copied from legacy.
 * No column stores a raw password, raw POS approval PIN, invitation token, or
 * reset token.
 */

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  meta: {
    destructive: false,
    targetKind: 'business',
    rollbackDescription:
      'Drops the dgfy_business_* tenant staff_credentials table only; no other tenant foundation table is touched.',
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

    if (!await tableExists('staff_credentials')) {
      await queryInterface.createTable('staff_credentials', {
        id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
        staff_account_id: {
          type: Sequelize.INTEGER,
          allowNull: false,
          references: { model: 'staff_accounts', key: 'id' },
          onDelete: 'CASCADE',
          onUpdate: 'CASCADE'
        },
        password_hash: { type: Sequelize.STRING(255), allowNull: true },
        pos_approval_pin_hash: { type: Sequelize.STRING(255), allowNull: true },
        credential_status: {
          type: Sequelize.ENUM('active', 'reset_required', 'disabled'),
          allowNull: false,
          defaultValue: 'active'
        },
        password_updated_at: { type: Sequelize.DATE, allowNull: true },
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

    await addIndexIfMissing('staff_credentials', ['staff_account_id'], {
      name: 'unique_staff_credentials_staff_account',
      unique: true
    });
    await addIndexIfMissing('staff_credentials', ['credential_status'], {
      name: 'idx_staff_credentials_status'
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('staff_credentials');

    if (queryInterface.sequelize && queryInterface.sequelize.getDialect() === 'mysql') {
      await queryInterface.sequelize
        .query('DROP TYPE IF EXISTS enum_staff_credentials_credential_status')
        .catch(() => {});
    }
  }
};
