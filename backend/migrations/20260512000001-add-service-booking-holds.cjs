'use strict';

const TABLE = 'service_booking_holds';

const normalizeTableName = (table) => {
  if (!table) return '';
  if (typeof table === 'string') return table;
  return table.tableName || table.TABLE_NAME || '';
};

const tableExists = async (queryInterface, tableName) => {
  const tables = await queryInterface.showAllTables();
  return (tables || []).map(normalizeTableName).includes(tableName);
};

const addIndexSafe = async (queryInterface, tableName, fields, options = {}) => {
  try {
    await queryInterface.addIndex(tableName, fields, options);
  } catch (error) {
    const message = String(error?.original?.sqlMessage || error?.message || '');
    if (!/Duplicate key name|already exists/i.test(message)) {
      throw error;
    }
  }
};

module.exports = {
  async up(queryInterface, Sequelize) {
    if (await tableExists(queryInterface, TABLE)) return;
    await queryInterface.createTable(TABLE, {
      hold_id: { type: Sequelize.INTEGER, autoIncrement: true, primaryKey: true },
      hold_token: { type: Sequelize.STRING(80), allowNull: false, unique: true },
      service_item_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: 'items', key: 'item_id' },
        onUpdate: 'CASCADE',
        onDelete: 'RESTRICT'
      },
      service_detail_id: {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: { model: 'service_item_details', key: 'service_detail_id' },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL'
      },
      store_customer_id: {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: { model: 'store_customers', key: 'customer_id' },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL'
      },
      quantity: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 1 },
      provider_user_id: {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: { model: 'users', key: 'user_id' },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL'
      },
      resource_id: {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: { model: 'service_resources', key: 'resource_id' },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL'
      },
      location_id: {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: { model: 'tenant_locations', key: 'location_id' },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL'
      },
      start_at: { type: Sequelize.DATE, allowNull: false },
      end_at: { type: Sequelize.DATE, allowNull: false },
      expires_at: { type: Sequelize.DATE, allowNull: false },
      status: {
        type: Sequelize.ENUM('active', 'consumed', 'expired', 'cancelled'),
        allowNull: false,
        defaultValue: 'active'
      },
      source: {
        type: Sequelize.ENUM('storefront', 'pos', 'admin'),
        allowNull: false,
        defaultValue: 'storefront'
      },
      idempotency_key: { type: Sequelize.STRING(120), allowNull: true },
      request_hash: { type: Sequelize.STRING(64), allowNull: true },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
      updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') }
    });
    await addIndexSafe(queryInterface, TABLE, ['hold_token'], { unique: true, name: 'uq_service_booking_holds_token' });
    await addIndexSafe(queryInterface, TABLE, ['service_item_id'], { name: 'idx_service_booking_holds_item' });
    await addIndexSafe(queryInterface, TABLE, ['store_customer_id'], { name: 'idx_service_booking_holds_customer' });
    await addIndexSafe(queryInterface, TABLE, ['provider_user_id'], { name: 'idx_service_booking_holds_provider' });
    await addIndexSafe(queryInterface, TABLE, ['resource_id'], { name: 'idx_service_booking_holds_resource' });
    await addIndexSafe(queryInterface, TABLE, ['location_id'], { name: 'idx_service_booking_holds_location' });
    await addIndexSafe(queryInterface, TABLE, ['status', 'expires_at'], { name: 'idx_service_booking_holds_active_expiry' });
    await addIndexSafe(queryInterface, TABLE, ['idempotency_key'], { name: 'idx_service_booking_holds_idempotency' });
  },

  async down(queryInterface) {
    if (await tableExists(queryInterface, TABLE)) {
      await queryInterface.dropTable(TABLE);
    }
  }
};
