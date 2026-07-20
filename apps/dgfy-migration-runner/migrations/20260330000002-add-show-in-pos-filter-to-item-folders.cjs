'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    const table = await queryInterface.describeTable('item_folders');
    if (!table.show_in_pos_filter) {
      await queryInterface.addColumn('item_folders', 'show_in_pos_filter', {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: true
      });
    }
  },

  async down(queryInterface) {
    const table = await queryInterface.describeTable('item_folders');
    if (table.show_in_pos_filter) {
      await queryInterface.removeColumn('item_folders', 'show_in_pos_filter');
    }
  }
};
