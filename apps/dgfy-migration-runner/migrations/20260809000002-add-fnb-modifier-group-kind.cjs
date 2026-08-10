'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    const columns = await queryInterface.describeTable('fnb_modifier_groups').catch(() => null);
    if (columns && !columns.group_kind) {
      await queryInterface.addColumn('fnb_modifier_groups', 'group_kind', {
        type: Sequelize.STRING(24),
        allowNull: false,
        defaultValue: 'modifier'
      });
    }
  },

  async down(queryInterface) {
    const columns = await queryInterface.describeTable('fnb_modifier_groups').catch(() => null);
    if (columns?.group_kind) await queryInterface.removeColumn('fnb_modifier_groups', 'group_kind');
  }
};
