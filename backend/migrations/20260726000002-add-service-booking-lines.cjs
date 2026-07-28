'use strict';

const TABLES = Object.freeze({
  ITEMS: 'items',
  SERVICE_BOOKINGS: 'service_bookings',
  POS_TRANSACTION_LINES: 'pos_transaction_lines',
  SERVICE_BOOKING_LINES: 'service_booking_lines'
});

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
    if (await tableExists(queryInterface, TABLES.SERVICE_BOOKING_LINES)) {
      return;
    }

    // Literal table name (not TABLES.SERVICE_BOOKING_LINES) so
    // check-tenant-schema-registry-coverage.js's static regex can resolve it and
    // verify a REQUIRED_TENANT_SCHEMA_TABLES entry exists, instead of only warning.
    await queryInterface.createTable('service_booking_lines', {
      booking_line_id: { type: Sequelize.INTEGER, autoIncrement: true, primaryKey: true },
      booking_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: TABLES.SERVICE_BOOKINGS, key: 'booking_id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },
      line_type: {
        type: Sequelize.ENUM('service', 'part'),
        allowNull: false,
        defaultValue: 'service'
      },
      item_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: TABLES.ITEMS, key: 'item_id' },
        onUpdate: 'CASCADE',
        onDelete: 'RESTRICT'
      },
      name_snapshot: { type: Sequelize.STRING(255), allowNull: false },
      quantity: { type: Sequelize.DECIMAL(24, 12), allowNull: false, defaultValue: 1 },
      unit_price: { type: Sequelize.DECIMAL(14, 4), allowNull: false, defaultValue: 0 },
      line_amount: { type: Sequelize.DECIMAL(14, 4), allowNull: false, defaultValue: 0 },
      vat_type_snapshot: {
        type: Sequelize.ENUM('vatable', 'vat_exempt', 'zero_rated'),
        allowNull: false,
        defaultValue: 'vatable'
      },
      stock_effect_type: {
        type: Sequelize.ENUM('inventory_issue', 'stock_exempt'),
        allowNull: false,
        defaultValue: 'stock_exempt'
      },
      stock_exempt_reason: { type: Sequelize.STRING(80), allowNull: true },
      // Loose reference, not a foreign key -- stock_movements is never FK-referenced
      // elsewhere in this codebase; movements are linked via reference_type/reference_id
      // strings by convention (see stockMovementService.js), which this column mirrors.
      stock_movement_id: { type: Sequelize.INTEGER, allowNull: true },
      pos_transaction_line_id: {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: { model: TABLES.POS_TRANSACTION_LINES, key: 'line_id' },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL'
      },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
      updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') }
    });

    await addIndexSafe(queryInterface, TABLES.SERVICE_BOOKING_LINES, ['booking_id'], { name: 'idx_service_booking_lines_booking' });
    await addIndexSafe(queryInterface, TABLES.SERVICE_BOOKING_LINES, ['item_id'], { name: 'idx_service_booking_lines_item' });
    await addIndexSafe(queryInterface, TABLES.SERVICE_BOOKING_LINES, ['line_type'], { name: 'idx_service_booking_lines_type' });
    await addIndexSafe(queryInterface, TABLES.SERVICE_BOOKING_LINES, ['pos_transaction_line_id'], { name: 'idx_service_booking_lines_pos_line' });
  },

  async down(queryInterface) {
    if (await tableExists(queryInterface, TABLES.SERVICE_BOOKING_LINES)) {
      await queryInterface.dropTable(TABLES.SERVICE_BOOKING_LINES);
    }
  }
};
