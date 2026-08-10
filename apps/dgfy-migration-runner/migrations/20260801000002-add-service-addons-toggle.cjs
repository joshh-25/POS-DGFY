'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    const columns = await queryInterface.describeTable('service_item_details').catch(() => null);
    if (!columns || columns.addons_enabled) return;

    await queryInterface.addColumn('service_item_details', 'addons_enabled', {
      type: Sequelize.BOOLEAN,
      allowNull: false,
      defaultValue: false,
      after: 'visible_in_pos'
    });
  },

  async down(queryInterface) {
    const columns = await queryInterface.describeTable('service_item_details').catch(() => null);
    if (columns?.addons_enabled) {
      await queryInterface.removeColumn('service_item_details', 'addons_enabled');
    }
  }
};
