'use strict';

/**
 * Phase 10 Plan 02: Inventory Reservation capability — additive migration for
 * inventory_reservations table (D-07, D-09, D-10, ADR 0029).
 *
 * `meta.targetKind: 'business'` structurally excludes this migration from
 * any run against `dgfy_core` or any other non-business target — it only
 * ever applies to a `dgfy_business_*` tenant database, following the same
 * idempotent helper shape as 20260712100000-create-commerce-foundation.cjs.
 *
 * Creates 1 new tenant-local table:
 *   inventory_reservations (stock-reservation ledger, sole writer modules/inventory)
 *
 * DB-level integrity guarantees:
 *   - Allows storefront orders to place temporary holds on stock (D-07)
 *   - Expired holds are excluded from availability on-read (D-09)
 *   - Expired holds are auto-released by the sweep (expireDueReservations)
 *   - Reservations convert to sales via the existing recordSale single-writer (ADR 0029)
 */

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  meta: {
    destructive: false,
    targetKind: 'business',
    rollbackDescription:
      'Drops the inventory_reservations table — additive Phase 10 ' +
      'stock-reservation capability only, no other dgfy_business_* table is touched.',
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

    // --- inventory_reservations (D-07/D-09/D-10: stock-reservation ledger) ---
    if (!await tableExists('inventory_reservations')) {
      await queryInterface.createTable('inventory_reservations', {
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
        // Positive held amount (quantity reserved, not delta).
        quantity: { type: Sequelize.DECIMAL(24, 12), allowNull: false },
        // reference_type defaults to 'storefront_order' (D-07: order public_reference).
        reference_type: {
          type: Sequelize.STRING(40),
          allowNull: false,
          defaultValue: 'storefront_order'
        },
        // reference_id is the storefront order's public_reference (opaque string).
        reference_id: {
          type: Sequelize.STRING(64),
          allowNull: false
        },
        // Status: active (held), committed (converted to sale), released (returned).
        status: {
          type: Sequelize.ENUM('active', 'committed', 'released'),
          allowNull: false,
          defaultValue: 'active'
        },
        // D-09: expires_at from the session (NULL if no session expiry).
        // On-read availability logic excludes expired-active rows from the held sum.
        expires_at: { type: Sequelize.DATE, allowNull: true },
        ...timestampColumns()
      });
    }

    // Indexes for availability queries, reference lookups, and expiry sweep.
    await addIndexIfMissing('inventory_reservations', ['product_id', 'status'], {
      name: 'idx_inventory_reservations_product_status'
    });
    await addIndexIfMissing('inventory_reservations', ['reference_type', 'reference_id'], {
      name: 'idx_inventory_reservations_reference'
    });
    await addIndexIfMissing('inventory_reservations', ['status', 'expires_at'], {
      name: 'idx_inventory_reservations_expiry'
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('inventory_reservations', { cascade: true });
  }
};
