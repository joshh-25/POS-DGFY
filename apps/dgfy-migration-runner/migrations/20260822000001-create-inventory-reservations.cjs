'use strict';

const normalizeTableName = (table) => {
  if (typeof table === 'string') return table;
  return table?.tableName || table?.TABLE_NAME || '';
};

const tableExists = async (queryInterface, tableName) => {
  const tables = await queryInterface.showAllTables();
  return tables.some((table) => normalizeTableName(table).toLowerCase() === tableName.toLowerCase());
};

const indexExists = async (queryInterface, tableName, indexName) => {
  const indexes = await queryInterface.showIndex(tableName).catch(() => []);
  return indexes.some((index) => index.name === indexName);
};

const addIndexIfMissing = async (queryInterface, tableName, fields, options) => {
  if (!(await indexExists(queryInterface, tableName, options.name))) {
    await queryInterface.addIndex(tableName, fields, options);
  }
};

module.exports = {
  async up(queryInterface, Sequelize) {
    if (!(await tableExists(queryInterface, 'inventory_reservations'))) {
      await queryInterface.createTable('inventory_reservations', {
        inventory_reservation_id: { type: Sequelize.INTEGER, autoIncrement: true, primaryKey: true },
        source_type: { type: Sequelize.ENUM('online_order'), allowNull: false },
        source_id: {
          type: Sequelize.INTEGER,
          allowNull: false,
          references: { model: 'pos_transactions', key: 'pos_transaction_id' },
          onUpdate: 'RESTRICT',
          onDelete: 'RESTRICT'
        },
        location_id: {
          type: Sequelize.INTEGER,
          allowNull: false,
          references: { model: 'tenant_locations', key: 'location_id' },
          onUpdate: 'RESTRICT',
          onDelete: 'RESTRICT'
        },
        status: {
          type: Sequelize.ENUM('active', 'released', 'expired', 'converted'),
          allowNull: false,
          defaultValue: 'active'
        },
        expires_at: { type: Sequelize.DATE, allowNull: false },
        released_at: { type: Sequelize.DATE, allowNull: true },
        release_reason: { type: Sequelize.STRING(80), allowNull: true },
        converted_at: { type: Sequelize.DATE, allowNull: true },
        created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
        updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP') }
      });
    }

    if (!(await tableExists(queryInterface, 'inventory_reservation_lines'))) {
      await queryInterface.createTable('inventory_reservation_lines', {
        inventory_reservation_line_id: { type: Sequelize.INTEGER, autoIncrement: true, primaryKey: true },
        inventory_reservation_id: {
          type: Sequelize.INTEGER,
          allowNull: false,
          references: { model: 'inventory_reservations', key: 'inventory_reservation_id' },
          onUpdate: 'RESTRICT',
          onDelete: 'CASCADE'
        },
        item_id: {
          type: Sequelize.INTEGER,
          allowNull: false,
          references: { model: 'items', key: 'item_id' },
          onUpdate: 'RESTRICT',
          onDelete: 'RESTRICT'
        },
        quantity: { type: Sequelize.DECIMAL(24, 12), allowNull: false },
        effect_type: {
          type: Sequelize.ENUM('line_item', 'recipe_ingredient', 'modifier'),
          allowNull: false
        },
        source_line_reference: { type: Sequelize.STRING(120), allowNull: false },
        metadata: { type: Sequelize.JSON, allowNull: true },
        created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
        updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP') }
      });
    }

    await addIndexIfMissing(queryInterface, 'inventory_reservations', ['source_type', 'source_id'], {
      name: 'uq_inventory_reservations_source',
      unique: true
    });
    await addIndexIfMissing(queryInterface, 'inventory_reservations', ['location_id', 'status', 'expires_at'], {
      name: 'idx_inventory_reservations_location_status_expiry'
    });
    await addIndexIfMissing(queryInterface, 'inventory_reservations', ['status', 'expires_at'], {
      name: 'idx_inventory_reservations_status_expiry'
    });
    await addIndexIfMissing(queryInterface, 'inventory_reservation_lines', ['inventory_reservation_id'], {
      name: 'idx_inventory_reservation_lines_reservation'
    });
    await addIndexIfMissing(queryInterface, 'inventory_reservation_lines', ['item_id'], {
      name: 'idx_inventory_reservation_lines_item'
    });
    await addIndexIfMissing(queryInterface, 'inventory_reservation_lines', ['item_id', 'created_at'], {
      name: 'idx_inventory_reservation_lines_item_created'
    });
  },

  async down(queryInterface) {
    if (await tableExists(queryInterface, 'inventory_reservation_lines')) {
      await queryInterface.dropTable('inventory_reservation_lines');
    }
    if (await tableExists(queryInterface, 'inventory_reservations')) {
      await queryInterface.dropTable('inventory_reservations');
    }
  }
};
