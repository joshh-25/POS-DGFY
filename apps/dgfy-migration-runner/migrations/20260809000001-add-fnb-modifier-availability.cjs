'use strict';

const addColumnSafe = async (queryInterface, table, column, definition) => {
  const columns = await queryInterface.describeTable(table).catch(() => null);
  if (columns && !columns[column]) await queryInterface.addColumn(table, column, definition);
};

const createTableSafe = async (queryInterface, table, definition, options = {}) => {
  const tables = await queryInterface.showAllTables();
  const normalized = tables.map((entry) => String(entry?.tableName || entry).toLowerCase());
  if (!normalized.includes(table.toLowerCase())) await queryInterface.createTable(table, definition, options);
};

const addIndexIfMissing = async (queryInterface, table, fields, options = {}) => {
  if (typeof queryInterface.showIndex === 'function') {
    const indexes = await queryInterface.showIndex(table);
    if (indexes.some((index) => index?.name === options.name)) return;
  }
  await queryInterface.addIndex(table, fields, options);
};

module.exports = {
  async up(queryInterface, Sequelize) {
    for (const table of ['fnb_modifier_groups', 'fnb_modifier_options']) {
      await addColumnSafe(queryInterface, table, 'visible_in_pos', {
        type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true
      });
      await addColumnSafe(queryInterface, table, 'visible_in_storefront', {
        type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true
      });
    }
    await addColumnSafe(queryInterface, 'fnb_modifier_options', 'is_sold_out', {
      type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false
    });

    await createTableSafe(queryInterface, 'fnb_modifier_group_location_availability', {
      modifier_group_location_availability_id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      modifier_group_id: { type: Sequelize.INTEGER, allowNull: false, references: { model: 'fnb_modifier_groups', key: 'modifier_group_id' }, onDelete: 'CASCADE' },
      location_id: { type: Sequelize.INTEGER, allowNull: false, references: { model: 'tenant_locations', key: 'location_id' }, onDelete: 'CASCADE' },
      is_available: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') },
      updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') }
    });
    await createTableSafe(queryInterface, 'fnb_modifier_option_location_availability', {
      modifier_option_location_availability_id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      modifier_option_id: { type: Sequelize.INTEGER, allowNull: false, references: { model: 'fnb_modifier_options', key: 'modifier_option_id' }, onDelete: 'CASCADE' },
      location_id: { type: Sequelize.INTEGER, allowNull: false, references: { model: 'tenant_locations', key: 'location_id' }, onDelete: 'CASCADE' },
      is_available: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true },
      is_sold_out: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') },
      updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') }
    });
    await addIndexIfMissing(queryInterface, 'fnb_modifier_group_location_availability', ['modifier_group_id', 'location_id'], { unique: true, name: 'uq_fnb_modifier_group_location' });
    await addIndexIfMissing(queryInterface, 'fnb_modifier_group_location_availability', ['location_id'], { name: 'idx_fnb_modifier_group_location_location' });
    await addIndexIfMissing(queryInterface, 'fnb_modifier_option_location_availability', ['modifier_option_id', 'location_id'], { unique: true, name: 'uq_fnb_modifier_option_location' });
    await addIndexIfMissing(queryInterface, 'fnb_modifier_option_location_availability', ['location_id'], { name: 'idx_fnb_modifier_option_location_location' });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('fnb_modifier_option_location_availability').catch(() => {});
    await queryInterface.dropTable('fnb_modifier_group_location_availability').catch(() => {});
    for (const table of ['fnb_modifier_options', 'fnb_modifier_groups']) {
      const columns = await queryInterface.describeTable(table).catch(() => null);
      if (columns?.visible_in_storefront) await queryInterface.removeColumn(table, 'visible_in_storefront');
      if (columns?.visible_in_pos) await queryInterface.removeColumn(table, 'visible_in_pos');
    }
    const optionColumns = await queryInterface.describeTable('fnb_modifier_options').catch(() => null);
    if (optionColumns?.is_sold_out) await queryInterface.removeColumn('fnb_modifier_options', 'is_sold_out');
  }
};
