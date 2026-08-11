'use strict';

const addIndexIfMissing = async (queryInterface, table, fields, options = {}) => {
  if (typeof queryInterface.showIndex === 'function') {
    const indexes = await queryInterface.showIndex(table);
    if (indexes.some((index) => index?.name === options.name)) return;
  }
  await queryInterface.addIndex(table, fields, options);
};

module.exports = {
  async up(queryInterface, Sequelize) {
    const columns = await queryInterface.describeTable('fnb_modifier_groups').catch(() => null);
    if (columns && !columns.parent_modifier_option_id) {
      await queryInterface.addColumn('fnb_modifier_groups', 'parent_modifier_option_id', {
        type: Sequelize.INTEGER, allowNull: true,
        references: { model: 'fnb_modifier_options', key: 'modifier_option_id' }, onDelete: 'SET NULL'
      });
      await addIndexIfMissing(queryInterface, 'fnb_modifier_groups', ['parent_modifier_option_id'], { name: 'idx_fnb_modifier_groups_parent_option' });
    }
  },
  async down(queryInterface) {
    const columns = await queryInterface.describeTable('fnb_modifier_groups').catch(() => null);
    if (columns?.parent_modifier_option_id) await queryInterface.removeColumn('fnb_modifier_groups', 'parent_modifier_option_id');
  }
};
