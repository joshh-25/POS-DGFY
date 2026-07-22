'use strict';

/**
 * Phase 02 Plan 03: additive per-business `dgfy_business_<stable_opaque_suffix>`
 * tenant foundation.
 *
 * Implements dgfyBusinessContract.js (D-02/D-03/D-10/D-14): locations,
 * staff_accounts, account_staff_assignments, roles, role_permissions,
 * terminal_identities, tenant_ownership_metadata, and tenant_audit_logs.
 *
 * `meta.targetKind: 'business'` tells the schema command (Task 2 of this
 * plan) that this migration only ever applies to a `dgfy_business_*`
 * target — it is structurally excluded from any run against `dgfy_core` or
 * any other non-business target, even though this file lives in the same
 * `src/migrations/schema` directory as the dgfy_core foundation migration.
 *
 * This migration only creates plain-name tenant-local tables. It does not
 * create any product/POS/inventory/fiscal/promo table (D-15, ADR 0029). All
 * operations use QueryInterface with existence guards so re-running this
 * migration against an already-migrated `dgfy_business_*` database is a
 * no-op (DBF-04).
 */

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  meta: {
    destructive: false,
    targetKind: 'business',
    rollbackDescription:
      'Drops the dgfy_business_* tenant foundation tables (locations, staff_accounts, ' +
      'account_staff_assignments, roles, role_permissions, terminal_identities, ' +
      'tenant_ownership_metadata, tenant_audit_logs) — additive Phase 02 tenant foundation ' +
      'only, no legacy sku_* schema is touched.',
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

    // --- locations (D-10, canonical) ---------------------------------------
    if (!await tableExists('locations')) {
      await queryInterface.createTable('locations', {
        id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
        name: { type: Sequelize.STRING(255), allowNull: false },
        address_line: { type: Sequelize.TEXT, allowNull: false },
        latitude: { type: Sequelize.DECIMAL(10, 8), allowNull: true },
        longitude: { type: Sequelize.DECIMAL(11, 8), allowNull: true },
        is_active: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true },
        is_primary: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
        ...timestampColumns()
      });
    }
    await addIndexIfMissing('locations', ['is_active'], { name: 'idx_locations_active' });
    await addIndexIfMissing('locations', ['is_primary'], { name: 'idx_locations_primary' });

    // --- staff_accounts (D-14) ----------------------------------------------
    if (!await tableExists('staff_accounts')) {
      await queryInterface.createTable('staff_accounts', {
        id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
        display_name: { type: Sequelize.STRING(255), allowNull: false },
        email: { type: Sequelize.STRING(255), allowNull: false },
        phone: { type: Sequelize.STRING(40), allowNull: true },
        status: {
          type: Sequelize.ENUM('active', 'suspended', 'removed'),
          allowNull: false,
          defaultValue: 'active'
        },
        // Bootstraps the first tenant admin before role/permission grants
        // exist for a freshly provisioned business database.
        is_master_admin: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
        ...timestampColumns()
      });
    }
    await addIndexIfMissing('staff_accounts', ['email'], {
      name: 'unique_staff_accounts_email',
      unique: true
    });
    await addIndexIfMissing('staff_accounts', ['status'], { name: 'idx_staff_accounts_status' });

    // --- account_staff_assignments (D-14) ------------------------------------
    if (!await tableExists('account_staff_assignments')) {
      await queryInterface.createTable('account_staff_assignments', {
        id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
        // Opaque UUID pointing at dgfy_core.accounts.id — never a real FK
        // (cross-database) and never a place to cache credentials (D-14).
        dgfy_account_id: { type: Sequelize.UUID, allowNull: false },
        staff_account_id: {
          type: Sequelize.INTEGER,
          allowNull: false,
          references: { model: 'staff_accounts', key: 'id' },
          onDelete: 'CASCADE',
          onUpdate: 'CASCADE'
        },
        role: {
          type: Sequelize.ENUM('owner', 'manager', 'staff'),
          allowNull: false,
          defaultValue: 'staff'
        },
        status: {
          type: Sequelize.ENUM('invited', 'active', 'removed'),
          allowNull: false,
          defaultValue: 'invited'
        },
        invited_at: { type: Sequelize.DATE, allowNull: true },
        accepted_at: { type: Sequelize.DATE, allowNull: true },
        ...timestampColumns()
      });
    }
    await addIndexIfMissing('account_staff_assignments', ['dgfy_account_id'], {
      name: 'unique_account_staff_assignments_dgfy_account',
      unique: true
    });
    await addIndexIfMissing('account_staff_assignments', ['staff_account_id'], {
      name: 'idx_account_staff_assignments_staff_account'
    });
    await addIndexIfMissing('account_staff_assignments', ['status'], {
      name: 'idx_account_staff_assignments_status'
    });

    // --- roles (D-14) --------------------------------------------------------
    if (!await tableExists('roles')) {
      await queryInterface.createTable('roles', {
        id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
        name: { type: Sequelize.STRING(80), allowNull: false },
        description: { type: Sequelize.STRING(255), allowNull: true },
        ...timestampColumns()
      });
    }
    await addIndexIfMissing('roles', ['name'], { name: 'unique_roles_name', unique: true });

    // --- role_permissions (D-14) ---------------------------------------------
    if (!await tableExists('role_permissions')) {
      await queryInterface.createTable('role_permissions', {
        id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
        role_id: {
          type: Sequelize.INTEGER,
          allowNull: false,
          references: { model: 'roles', key: 'id' },
          onDelete: 'CASCADE',
          onUpdate: 'CASCADE'
        },
        permission_key: { type: Sequelize.STRING(120), allowNull: false },
        created_at: {
          type: Sequelize.DATE,
          allowNull: false,
          defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
        }
      });
    }
    await addIndexIfMissing('role_permissions', ['role_id', 'permission_key'], {
      name: 'unique_role_permissions_role_permission',
      unique: true
    });
    await addIndexIfMissing('role_permissions', ['role_id'], {
      name: 'idx_role_permissions_role_id'
    });

    // --- terminal_identities (D-14/T-02-03-04) --------------------------------
    if (!await tableExists('terminal_identities')) {
      await queryInterface.createTable('terminal_identities', {
        id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
        terminal_code: { type: Sequelize.STRING(40), allowNull: false },
        label: { type: Sequelize.STRING(120), allowNull: true },
        location_id: {
          type: Sequelize.INTEGER,
          allowNull: true,
          references: { model: 'locations', key: 'id' },
          onDelete: 'SET NULL',
          onUpdate: 'CASCADE'
        },
        status: {
          type: Sequelize.ENUM('active', 'inactive'),
          allowNull: false,
          defaultValue: 'active'
        },
        last_seen_at: { type: Sequelize.DATE, allowNull: true },
        ...timestampColumns()
      });
    }
    await addIndexIfMissing('terminal_identities', ['terminal_code'], {
      name: 'unique_terminal_identities_terminal_code',
      unique: true
    });
    await addIndexIfMissing('terminal_identities', ['location_id'], {
      name: 'idx_terminal_identities_location_id'
    });
    await addIndexIfMissing('terminal_identities', ['status'], {
      name: 'idx_terminal_identities_status'
    });

    // --- tenant_ownership_metadata (D-14) -------------------------------------
    if (!await tableExists('tenant_ownership_metadata')) {
      await queryInterface.createTable('tenant_ownership_metadata', {
        id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
        // Opaque UUID pointing at dgfy_core.businesses.id — never a real FK
        // (cross-database).
        business_id: { type: Sequelize.UUID, allowNull: false },
        business_handle: { type: Sequelize.STRING(120), allowNull: false },
        stable_opaque_suffix: { type: Sequelize.STRING(64), allowNull: false },
        // Opaque UUID pointing at dgfy_core.accounts.id — never a real FK
        // (cross-database).
        owner_dgfy_account_id: { type: Sequelize.UUID, allowNull: false },
        ...timestampColumns()
      });
    }
    await addIndexIfMissing('tenant_ownership_metadata', ['business_id'], {
      name: 'unique_tenant_ownership_metadata_business_id',
      unique: true
    });

    // --- tenant_audit_logs (D-14) ---------------------------------------------
    if (!await tableExists('tenant_audit_logs')) {
      await queryInterface.createTable('tenant_audit_logs', {
        audit_log_id: { type: Sequelize.BIGINT.UNSIGNED, primaryKey: true, autoIncrement: true },
        // Opaque UUID pointing at dgfy_core.accounts.id — never a real FK
        // (cross-database).
        actor_dgfy_account_id: { type: Sequelize.UUID, allowNull: true },
        staff_account_id: {
          type: Sequelize.INTEGER,
          allowNull: true,
          references: { model: 'staff_accounts', key: 'id' },
          onDelete: 'SET NULL',
          onUpdate: 'CASCADE'
        },
        action: {
          type: Sequelize.ENUM(
            'staff_assignment_changed',
            'role_permission_changed',
            'terminal_identity_changed',
            'location_changed',
            'ownership_metadata_changed'
          ),
          allowNull: false
        },
        before_snapshot: { type: Sequelize.JSON, allowNull: true },
        after_snapshot: { type: Sequelize.JSON, allowNull: true },
        created_at: {
          type: Sequelize.DATE,
          allowNull: false,
          defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
        }
      });
    }
    await addIndexIfMissing('tenant_audit_logs', ['action'], {
      name: 'idx_tenant_audit_logs_action'
    });
    await addIndexIfMissing('tenant_audit_logs', ['created_at'], {
      name: 'idx_tenant_audit_logs_time'
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('tenant_audit_logs');
    await queryInterface.dropTable('tenant_ownership_metadata');
    await queryInterface.dropTable('terminal_identities');
    await queryInterface.dropTable('role_permissions');
    await queryInterface.dropTable('roles');
    await queryInterface.dropTable('account_staff_assignments');
    await queryInterface.dropTable('staff_accounts');
    await queryInterface.dropTable('locations');

    if (queryInterface.sequelize && queryInterface.sequelize.getDialect() === 'mysql') {
      await queryInterface.sequelize.query('DROP TYPE IF EXISTS enum_staff_accounts_status').catch(() => {});
      await queryInterface.sequelize.query('DROP TYPE IF EXISTS enum_account_staff_assignments_role').catch(() => {});
      await queryInterface.sequelize
        .query('DROP TYPE IF EXISTS enum_account_staff_assignments_status')
        .catch(() => {});
      await queryInterface.sequelize.query('DROP TYPE IF EXISTS enum_terminal_identities_status').catch(() => {});
      await queryInterface.sequelize.query('DROP TYPE IF EXISTS enum_tenant_audit_logs_action').catch(() => {});
    }
  }
};
