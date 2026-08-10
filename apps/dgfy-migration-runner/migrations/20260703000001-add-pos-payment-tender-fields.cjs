'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    const table = await queryInterface.describeTable('pos_transactions');
    if (!table.cash_received) {
      await queryInterface.addColumn('pos_transactions', 'cash_received', {
        type: Sequelize.DECIMAL(14, 4), allowNull: true, after: 'payment_type'
      });
    }
    if (!table.change_amount) {
      await queryInterface.addColumn('pos_transactions', 'change_amount', {
        type: Sequelize.DECIMAL(14, 4), allowNull: true, after: 'cash_received'
      });
    }
  },

  async down(queryInterface) {
    const table = await queryInterface.describeTable('pos_transactions');
    if (table.change_amount) await queryInterface.removeColumn('pos_transactions', 'change_amount');
    if (table.cash_received) await queryInterface.removeColumn('pos_transactions', 'cash_received');
  }
};
