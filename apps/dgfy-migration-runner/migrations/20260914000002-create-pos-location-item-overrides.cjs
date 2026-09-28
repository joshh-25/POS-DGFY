'use strict';

const tableExists = async (queryInterface, tableName) => {
  const tables = await queryInterface.showAllTables();
  return (tables || []).some((entry) => (
    (typeof entry === 'string' ? entry : entry?.tableName) === tableName
  ));
};

const addIndexSafe = async (queryInterface, tableName, fields, options = {}) => {
  const indexes = await queryInterface.showIndex(tableName).catch(() => []);
  if ((indexes || []).some((index) => index.name === options.name)) return;
  await queryInterface.addIndex(tableName, fields, options);
};

module.exports = {
  async up(queryInterface, Sequelize) {
    if (!(await tableExists(queryInterface, 'items')) || !(await tableExists(queryInterface, 'tenant_locations'))) {
      return;
    }

    if (!(await tableExists(queryInterface, 'pos_location_item_overrides'))) {
      await queryInterface.createTable('pos_location_item_overrides', {
        pos_location_item_override_id: {
          type: Sequelize.INTEGER,
          primaryKey: true,
          autoIncrement: true
        },
        item_id: {
          type: Sequelize.INTEGER,
          allowNull: false,
          references: { model: 'items', key: 'item_id' },
          onDelete: 'CASCADE',
          onUpdate: 'CASCADE'
        },
        location_id: {
          type: Sequelize.INTEGER,
          allowNull: false,
          references: { model: 'tenant_locations', key: 'location_id' },
          onDelete: 'CASCADE',
          onUpdate: 'CASCADE'
        },
        pos_available: {
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

    await addIndexSafe(queryInterface, 'pos_location_item_overrides', ['item_id', 'location_id'], {
      unique: true,
      name: 'uq_pos_location_item_overrides_item_location'
    });
    await addIndexSafe(queryInterface, 'pos_location_item_overrides', ['location_id'], {
      name: 'idx_pos_location_item_overrides_location'
    });
    await addIndexSafe(queryInterface, 'pos_location_item_overrides', ['pos_available'], {
      name: 'idx_pos_location_item_overrides_available'
    });
  },

  async down(queryInterface) {
    if (await tableExists(queryInterface, 'pos_location_item_overrides')) {
      await queryInterface.dropTable('pos_location_item_overrides');
    }
  }
};
