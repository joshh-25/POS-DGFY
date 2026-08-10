'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    const columns = await queryInterface.describeTable('fnb_modifier_groups').catch(() => null);
    if (columns && !columns.parent_modifier_option_id) {
      await queryInterface.addColumn('fnb_modifier_groups', 'parent_modifier_option_id', {
        type: Sequelize.INTEGER, allowNull: true,
        references: { model: 'fnb_modifier_options', key: 'modifier_option_id' }, onDelete: 'SET NULL'
      });
      await queryInterface.addIndex('fnb_modifier_groups', ['parent_modifier_option_id'], { name: 'idx_fnb_modifier_groups_parent_option' }).catch(() => {});
    }
  },
  async down(queryInterface) {
    const columns = await queryInterface.describeTable('fnb_modifier_groups').catch(() => null);
    if (columns?.parent_modifier_option_id) await queryInterface.removeColumn('fnb_modifier_groups', 'parent_modifier_option_id');
  }
};
