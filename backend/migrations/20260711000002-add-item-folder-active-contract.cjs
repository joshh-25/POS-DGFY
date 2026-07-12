'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    const table = await queryInterface.describeTable('item_folders');
    if (!table.is_active) {
      await queryInterface.addColumn('item_folders', 'is_active', {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: true
      });
    }
  },

  async down(queryInterface) {
    const table = await queryInterface.describeTable('item_folders');
    if (table.is_active) {
      await queryInterface.removeColumn('item_folders', 'is_active');
    }
  }
};
