'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    const table = await queryInterface.describeTable('dgfy_accounts');
    if (!table.middle_name) {
      await queryInterface.addColumn('dgfy_accounts', 'middle_name', {
        type: Sequelize.STRING(80),
        allowNull: true
      });
    }
  },

  async down(queryInterface) {
    const table = await queryInterface.describeTable('dgfy_accounts');
    if (table.middle_name) {
      await queryInterface.removeColumn('dgfy_accounts', 'middle_name');
    }
  }
};
