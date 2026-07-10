'use strict';

/**
 * Phase 02 Plan 02: additive `dgfy_core` landlord foundation.
 *
 * Implements dgfyCoreContract.js (D-01/D-04 through D-13): accounts,
 * businesses, business_memberships, business_database_registry,
 * business_audit_logs, and the storefront_discovery_index projection.
 *
 * This migration only creates plain-name tables inside `dgfy_core`. It does
 * not create canonical `branches`/`locations` (those live in `dgfy_business_*`
 * per D-10 — Plan 03) and does not create any product/POS/inventory/fiscal/
 * promo table (D-15, ADR 0029). All operations use QueryInterface with
 * existence guards so re-running this migration against an already-migrated
 * `dgfy_core` is a no-op (DBF-04).
 */

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  meta: {
    destructive: false,
    rollbackDescription:
      'Drops the dgfy_core foundation tables (accounts, businesses, business_memberships, ' +
      'business_database_registry, business_audit_logs, storefront_discovery_index) — additive ' +
      'Phase 02 landlord foundation only, no legacy sku_* schema is touched.',
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

    // --- accounts (D-06) ---------------------------------------------------
    if (!await tableExists('accounts')) {
      await queryInterface.createTable('accounts', {
        id: {
          type: Sequelize.UUID,
          defaultValue: Sequelize.UUIDV4,
          primaryKey: true
        },
        first_name: { type: Sequelize.STRING(80), allowNull: false },
        last_name: { type: Sequelize.STRING(80), allowNull: false },
        email: { type: Sequelize.STRING(255), allowNull: false },
        phone: { type: Sequelize.STRING(40), allowNull: false },
        password_hash: { type: Sequelize.STRING(255), allowNull: false },
        status: {
          type: Sequelize.ENUM('active', 'suspended', 'deleted'),
          allowNull: false,
          defaultValue: 'active'
        },
        // ASVS V2: verification timestamps are tracked explicitly so a
        // deferred phone verification is never treated as verified.
        email_verified_at: { type: Sequelize.DATE, allowNull: true },
        phone_verified_at: { type: Sequelize.DATE, allowNull: true },
        last_login_at: { type: Sequelize.DATE, allowNull: true },
        ...timestampColumns()
      });
    }
    await addIndexIfMissing('accounts', ['email'], { name: 'unique_accounts_email', unique: true });
    await addIndexIfMissing('accounts', ['phone'], { name: 'unique_accounts_phone', unique: true });

    // --- businesses (D-06) --------------------------------------------------
    if (!await tableExists('businesses')) {
      await queryInterface.createTable('businesses', {
        id: {
          type: Sequelize.UUID,
          defaultValue: Sequelize.UUIDV4,
          primaryKey: true
        },
        // D-03: business_handle is a stable opaque public identifier that
        // must never be re-derived from a sanitized display name.
        business_handle: { type: Sequelize.STRING(120), allowNull: false },
        legal_name: { type: Sequelize.STRING(255), allowNull: false },
        display_name: { type: Sequelize.STRING(255), allowNull: false },
        status: {
          type: Sequelize.ENUM('pending', 'active', 'suspended', 'archived'),
          allowNull: false,
          defaultValue: 'pending'
        },
        ...timestampColumns()
      });
    }
    await addIndexIfMissing('businesses', ['business_handle'], {
      name: 'unique_businesses_business_handle',
      unique: true
    });
    await addIndexIfMissing('businesses', ['status'], { name: 'idx_businesses_status' });

    // --- business_memberships (D-07) ---------------------------------------
    if (!await tableExists('business_memberships')) {
      await queryInterface.createTable('business_memberships', {
        id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
        account_id: {
          type: Sequelize.UUID,
          allowNull: false,
          references: { model: 'accounts', key: 'id' },
          onDelete: 'CASCADE',
          onUpdate: 'CASCADE'
        },
        business_id: {
          type: Sequelize.UUID,
          allowNull: false,
          references: { model: 'businesses', key: 'id' },
          onDelete: 'CASCADE',
          onUpdate: 'CASCADE'
        },
        // Minimal now (single-owner enforced at application level), but the
        // enum already covers manager/member so no future schema rewrite is
        // needed to add those roles (D-07).
        role: {
          type: Sequelize.ENUM('owner', 'manager', 'member'),
          allowNull: false,
          defaultValue: 'owner'
        },
        status: {
          type: Sequelize.ENUM('active', 'invited', 'removed'),
          allowNull: false,
          defaultValue: 'active'
        },
        ...timestampColumns()
      });
    }
    await addIndexIfMissing('business_memberships', ['business_id', 'account_id'], {
      name: 'unique_business_memberships_business_account',
      unique: true
    });
    await addIndexIfMissing('business_memberships', ['business_id', 'role'], {
      name: 'idx_business_memberships_business_role'
    });

    // --- business_database_registry (D-08) ----------------------------------
    if (!await tableExists('business_database_registry')) {
      await queryInterface.createTable('business_database_registry', {
        id: { type: Sequelize.BIGINT.UNSIGNED, primaryKey: true, autoIncrement: true },
        business_id: {
          type: Sequelize.UUID,
          allowNull: false,
          references: { model: 'businesses', key: 'id' },
          onDelete: 'CASCADE',
          onUpdate: 'CASCADE'
        },
        // D-02/D-03: stable opaque suffix, never derived from a display name.
        stable_opaque_suffix: { type: Sequelize.STRING(64), allowNull: false },
        // The actual dgfy_business_<stable_opaque_suffix> database name.
        database_name: { type: Sequelize.STRING(128), allowNull: false },
        status: {
          type: Sequelize.ENUM('provisioning', 'active', 'migrating', 'deprecated'),
          allowNull: false,
          defaultValue: 'provisioning'
        },
        verified_at: { type: Sequelize.DATE, allowNull: true },
        ...timestampColumns()
      });
    }
    await addIndexIfMissing('business_database_registry', ['stable_opaque_suffix'], {
      name: 'unique_business_database_registry_suffix',
      unique: true
    });
    await addIndexIfMissing('business_database_registry', ['database_name'], {
      name: 'unique_business_database_registry_database_name',
      unique: true
    });
    await addIndexIfMissing('business_database_registry', ['business_id'], {
      name: 'idx_business_database_registry_business_id'
    });

    // --- business_audit_logs (D-09) -----------------------------------------
    if (!await tableExists('business_audit_logs')) {
      await queryInterface.createTable('business_audit_logs', {
        audit_log_id: { type: Sequelize.BIGINT.UNSIGNED, primaryKey: true, autoIncrement: true },
        business_id: {
          type: Sequelize.UUID,
          allowNull: true,
          references: { model: 'businesses', key: 'id' },
          onDelete: 'SET NULL',
          onUpdate: 'CASCADE'
        },
        account_id: {
          type: Sequelize.UUID,
          allowNull: true,
          references: { model: 'accounts', key: 'id' },
          onDelete: 'SET NULL',
          onUpdate: 'CASCADE'
        },
        action: {
          type: Sequelize.ENUM(
            'business_created',
            'ownership_changed',
            'membership_changed',
            'database_pointer_changed',
            'migration_admin_action'
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
    await addIndexIfMissing('business_audit_logs', ['business_id', 'created_at'], {
      name: 'idx_business_audit_logs_business_time'
    });
    await addIndexIfMissing('business_audit_logs', ['action'], {
      name: 'idx_business_audit_logs_action'
    });

    // --- storefront_discovery_index (D-10/D-11/D-12/D-13, projection only) --
    if (!await tableExists('storefront_discovery_index')) {
      await queryInterface.createTable('storefront_discovery_index', {
        id: { type: Sequelize.BIGINT.UNSIGNED, primaryKey: true, autoIncrement: true },
        business_id: {
          type: Sequelize.UUID,
          allowNull: false,
          references: { model: 'businesses', key: 'id' },
          onDelete: 'CASCADE',
          onUpdate: 'CASCADE'
        },
        handle: { type: Sequelize.STRING(120), allowNull: false },
        display_name: { type: Sequelize.STRING(255), allowNull: false },
        is_visible: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true },
        // Denormalized read-model snapshots only — never canonical truth.
        location_snapshot: { type: Sequelize.JSON, allowNull: true },
        search_snapshot: { type: Sequelize.JSON, allowNull: true },
        last_synced_at: { type: Sequelize.DATE, allowNull: true },
        ...timestampColumns()
      });
    }
    await addIndexIfMissing('storefront_discovery_index', ['handle'], {
      name: 'unique_storefront_discovery_index_handle',
      unique: true
    });
    await addIndexIfMissing('storefront_discovery_index', ['business_id'], {
      name: 'idx_storefront_discovery_index_business_id'
    });
    await addIndexIfMissing('storefront_discovery_index', ['is_visible'], {
      name: 'idx_storefront_discovery_index_visible'
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('storefront_discovery_index');
    await queryInterface.dropTable('business_audit_logs');
    await queryInterface.dropTable('business_database_registry');
    await queryInterface.dropTable('business_memberships');
    await queryInterface.dropTable('businesses');
    await queryInterface.dropTable('accounts');

    if (queryInterface.sequelize && queryInterface.sequelize.getDialect() === 'mysql') {
      await queryInterface.sequelize.query('DROP TYPE IF EXISTS enum_accounts_status').catch(() => {});
      await queryInterface.sequelize.query('DROP TYPE IF EXISTS enum_businesses_status').catch(() => {});
      await queryInterface.sequelize.query('DROP TYPE IF EXISTS enum_business_memberships_role').catch(() => {});
      await queryInterface.sequelize.query('DROP TYPE IF EXISTS enum_business_memberships_status').catch(() => {});
      await queryInterface.sequelize
        .query('DROP TYPE IF EXISTS enum_business_database_registry_status')
        .catch(() => {});
      await queryInterface.sequelize.query('DROP TYPE IF EXISTS enum_business_audit_logs_action').catch(() => {});
    }
  }
};
