'use strict';

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
  const indexes = await queryInterface.showIndex(tableName).catch(() => []);
  if ((indexes || []).some((index) => index.name === options.name)) return;
  await queryInterface.addIndex(tableName, fields, options);
};

module.exports = {
  async up(queryInterface, Sequelize) {
    if (!(await tableExists(queryInterface, 'items'))) return;
    if (!(await tableExists(queryInterface, 'tenant_locations'))) return;

    if (!(await tableExists(queryInterface, 'storefront_location_item_overrides'))) {
      await queryInterface.createTable('storefront_location_item_overrides', {
        storefront_location_item_override_id: {
          type: Sequelize.INTEGER,
          autoIncrement: true,
          primaryKey: true
        },
        item_id: {
          type: Sequelize.INTEGER,
          allowNull: false,
          references: {
            model: 'items',
            key: 'item_id'
          },
          onDelete: 'CASCADE'
        },
        location_id: {
          type: Sequelize.INTEGER,
          allowNull: false,
          references: {
            model: 'tenant_locations',
            key: 'location_id'
          },
          onDelete: 'CASCADE'
        },
        storefront_available: {
          type: Sequelize.BOOLEAN,
          allowNull: false,
          defaultValue: true
        },
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

    await addIndexSafe(queryInterface, 'storefront_location_item_overrides', ['item_id', 'location_id'], {
      unique: true,
      name: 'uq_storefront_location_item_overrides_item_location'
    });
    await addIndexSafe(queryInterface, 'storefront_location_item_overrides', ['location_id'], {
      name: 'idx_storefront_location_item_overrides_location'
    });
    await addIndexSafe(queryInterface, 'storefront_location_item_overrides', ['storefront_available'], {
      name: 'idx_storefront_location_item_overrides_available'
    });
  },

  async down(queryInterface) {
    if (await tableExists(queryInterface, 'storefront_location_item_overrides')) {
      await queryInterface.dropTable('storefront_location_item_overrides');
    }
  }
};
