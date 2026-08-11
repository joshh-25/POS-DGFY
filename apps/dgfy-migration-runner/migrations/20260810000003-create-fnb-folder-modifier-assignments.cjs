'use strict';

const addColumnSafe = async (queryInterface, table, column, definition) => {
  const columns = await queryInterface.describeTable(table).catch(() => null);
  if (columns && !columns[column]) await queryInterface.addColumn(table, column, definition);
};

const createTableSafe = async (queryInterface, table, definition) => {
  const tables = await queryInterface.showAllTables();
  const normalized = tables.map((entry) => String(entry?.tableName || entry).toLowerCase());
  if (!normalized.includes(table.toLowerCase())) await queryInterface.createTable(table, definition);
};

const addIndexIfMissing = async (queryInterface, table, fields, options = {}) => {
  if (typeof queryInterface.showIndex === 'function') {
    const indexes = await queryInterface.showIndex(table).catch(() => []);
    if (indexes.some((index) => index?.name === options.name)) return;
  }
  await queryInterface.addIndex(table, fields, options);
};

module.exports = {
  async up(queryInterface, Sequelize) {
    await addColumnSafe(queryInterface, 'fnb_item_modifier_groups', 'is_excluded', {
      type: Sequelize.BOOLEAN,
      allowNull: false,
      defaultValue: false
    });
    await createTableSafe(queryInterface, 'fnb_folder_modifier_groups', {
      folder_modifier_group_id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      folder_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: 'item_folders', key: 'folder_id' },
        onDelete: 'CASCADE'
      },
      modifier_group_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: 'fnb_modifier_groups', key: 'modifier_group_id' },
        onDelete: 'CASCADE'
      },
      is_required_override: { type: Sequelize.BOOLEAN, allowNull: true },
      sort_order: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') },
      updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') }
    });
    await addIndexIfMissing(queryInterface, 'fnb_folder_modifier_groups', ['folder_id'], {
      name: 'idx_fnb_folder_modifier_groups_folder'
    });
    await addIndexIfMissing(queryInterface, 'fnb_folder_modifier_groups', ['modifier_group_id'], {
      name: 'idx_fnb_folder_modifier_groups_group'
    });
    await addIndexIfMissing(queryInterface, 'fnb_folder_modifier_groups', ['folder_id', 'modifier_group_id'], {
      unique: true,
      name: 'uq_fnb_folder_modifier_groups_folder_group'
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('fnb_folder_modifier_groups').catch(() => {});
    const columns = await queryInterface.describeTable('fnb_item_modifier_groups').catch(() => null);
    if (columns?.is_excluded) await queryInterface.removeColumn('fnb_item_modifier_groups', 'is_excluded');
  }
};
