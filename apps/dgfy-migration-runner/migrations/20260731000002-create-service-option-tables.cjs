'use strict';

const TABLES = Object.freeze({
  ITEMS: 'items',
  SERVICE_BOOKING_LINES: 'service_booking_lines',
  SERVICE_OPTION_GROUPS: 'service_option_groups',
  SERVICE_OPTIONS: 'service_options',
  SERVICE_ITEM_OPTION_GROUPS: 'service_item_option_groups',
  SERVICE_BOOKING_LINE_OPTIONS: 'service_booking_line_options'
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
    if (!(await tableExists(queryInterface, TABLES.SERVICE_OPTION_GROUPS))) {
      await queryInterface.createTable(TABLES.SERVICE_OPTION_GROUPS, {
        group_id: { type: Sequelize.INTEGER, autoIncrement: true, primaryKey: true },
        tenant_id: { type: Sequelize.STRING(80), allowNull: true },
        name: { type: Sequelize.STRING(160), allowNull: false },
        description: { type: Sequelize.TEXT, allowNull: true },
        group_type: {
          type: Sequelize.ENUM('variation', 'addon'),
          allowNull: false,
          defaultValue: 'addon'
        },
        selection_type: {
          type: Sequelize.ENUM('single', 'multi'),
          allowNull: false,
          defaultValue: 'single'
        },
        min_selections: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
        max_selections: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 1 },
        is_required: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
        display_order: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
        status: {
          type: Sequelize.ENUM('active', 'inactive'),
          allowNull: false,
          defaultValue: 'active'
        },
        created_at: {
          type: Sequelize.DATE,
          allowNull: false,
          defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
        },
        updated_at: {
          type: Sequelize.DATE,
          allowNull: false,
          defaultValue: Sequelize.literal('CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP')
        }
      });
      await addIndexSafe(queryInterface, TABLES.SERVICE_OPTION_GROUPS, ['status'], {
        name: 'idx_service_option_groups_status'
      });
    }

    if (!(await tableExists(queryInterface, TABLES.SERVICE_OPTIONS))) {
      await queryInterface.createTable(TABLES.SERVICE_OPTIONS, {
        option_id: { type: Sequelize.INTEGER, autoIncrement: true, primaryKey: true },
        group_id: {
          type: Sequelize.INTEGER,
          allowNull: false,
          references: { model: TABLES.SERVICE_OPTION_GROUPS, key: 'group_id' },
          onUpdate: 'CASCADE',
          onDelete: 'CASCADE'
        },
        tenant_id: { type: Sequelize.STRING(80), allowNull: true },
        name: { type: Sequelize.STRING(160), allowNull: false },
        description: { type: Sequelize.TEXT, allowNull: true },
        price_adjustment_centavos: { type: Sequelize.BIGINT, allowNull: false, defaultValue: 0 },
        duration_adjustment_minutes: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
        linked_physical_item_id: {
          type: Sequelize.INTEGER,
          allowNull: true,
          references: { model: TABLES.ITEMS, key: 'item_id' },
          onUpdate: 'CASCADE',
          onDelete: 'SET NULL'
        },
        display_order: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
        status: {
          type: Sequelize.ENUM('active', 'inactive'),
          allowNull: false,
          defaultValue: 'active'
        },
        created_at: {
          type: Sequelize.DATE,
          allowNull: false,
          defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
        },
        updated_at: {
          type: Sequelize.DATE,
          allowNull: false,
          defaultValue: Sequelize.literal('CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP')
        }
      });
      await addIndexSafe(queryInterface, TABLES.SERVICE_OPTIONS, ['group_id', 'status'], {
        name: 'idx_service_options_group_status'
      });
    }

    if (!(await tableExists(queryInterface, TABLES.SERVICE_ITEM_OPTION_GROUPS))) {
      await queryInterface.createTable(TABLES.SERVICE_ITEM_OPTION_GROUPS, {
        item_group_id: { type: Sequelize.INTEGER, autoIncrement: true, primaryKey: true },
        service_item_id: {
          type: Sequelize.INTEGER,
          allowNull: false,
          references: { model: TABLES.ITEMS, key: 'item_id' },
          onUpdate: 'CASCADE',
          onDelete: 'CASCADE'
        },
        option_group_id: {
          type: Sequelize.INTEGER,
          allowNull: false,
          references: { model: TABLES.SERVICE_OPTION_GROUPS, key: 'group_id' },
          onUpdate: 'CASCADE',
          onDelete: 'CASCADE'
        },
        tenant_id: { type: Sequelize.STRING(80), allowNull: true },
        display_order: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
        created_at: {
          type: Sequelize.DATE,
          allowNull: false,
          defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
        },
        updated_at: {
          type: Sequelize.DATE,
          allowNull: false,
          defaultValue: Sequelize.literal('CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP')
        }
      });
      await addIndexSafe(
        queryInterface,
        TABLES.SERVICE_ITEM_OPTION_GROUPS,
        ['service_item_id', 'option_group_id'],
        {
          unique: true,
          name: 'unique_service_item_option_group'
        }
      );
    }

    if (!(await tableExists(queryInterface, TABLES.SERVICE_BOOKING_LINE_OPTIONS))) {
      await queryInterface.createTable(TABLES.SERVICE_BOOKING_LINE_OPTIONS, {
        line_option_id: { type: Sequelize.INTEGER, autoIncrement: true, primaryKey: true },
        booking_line_id: {
          type: Sequelize.INTEGER,
          allowNull: false,
          references: { model: TABLES.SERVICE_BOOKING_LINES, key: 'booking_line_id' },
          onUpdate: 'CASCADE',
          onDelete: 'CASCADE'
        },
        option_group_id: { type: Sequelize.INTEGER, allowNull: true },
        option_id: { type: Sequelize.INTEGER, allowNull: true },
        group_name_snapshot: { type: Sequelize.STRING(160), allowNull: false },
        option_name_snapshot: { type: Sequelize.STRING(160), allowNull: false },
        group_type_snapshot: { type: Sequelize.STRING(40), allowNull: false, defaultValue: 'addon' },
        price_adjustment_snapshot_centavos: { type: Sequelize.BIGINT, allowNull: false, defaultValue: 0 },
        duration_adjustment_snapshot_minutes: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
        tax_snapshot: { type: Sequelize.TEXT, allowNull: true },
        linked_physical_item_id_snapshot: { type: Sequelize.INTEGER, allowNull: true },
        created_at: {
          type: Sequelize.DATE,
          allowNull: false,
          defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
        }
      });
      await addIndexSafe(queryInterface, TABLES.SERVICE_BOOKING_LINE_OPTIONS, ['booking_line_id'], {
        name: 'idx_service_booking_line_options_line'
      });
    }
  },

  async down(queryInterface) {
    if (await tableExists(queryInterface, TABLES.SERVICE_BOOKING_LINE_OPTIONS)) {
      await queryInterface.dropTable(TABLES.SERVICE_BOOKING_LINE_OPTIONS);
    }
    if (await tableExists(queryInterface, TABLES.SERVICE_ITEM_OPTION_GROUPS)) {
      await queryInterface.dropTable(TABLES.SERVICE_ITEM_OPTION_GROUPS);
    }
    if (await tableExists(queryInterface, TABLES.SERVICE_OPTIONS)) {
      await queryInterface.dropTable(TABLES.SERVICE_OPTIONS);
    }
    if (await tableExists(queryInterface, TABLES.SERVICE_OPTION_GROUPS)) {
      await queryInterface.dropTable(TABLES.SERVICE_OPTION_GROUPS);
    }
  }
};
