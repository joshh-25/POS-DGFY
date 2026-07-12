'use strict';
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('pos_transactions', 'payment_collected_at', { type: Sequelize.DATE, allowNull: true });
    await queryInterface.addColumn('pos_transactions', 'payment_collected_by', { type: Sequelize.INTEGER, allowNull: true });
    await queryInterface.addColumn('pos_transactions', 'payment_collected_shift_id', { type: Sequelize.INTEGER, allowNull: true });
    await queryInterface.addColumn('pos_transactions', 'payment_collected_terminal_id', { type: Sequelize.STRING(100), allowNull: true });
  },
  async down(queryInterface) {
    await queryInterface.removeColumn('pos_transactions', 'payment_collected_terminal_id');
    await queryInterface.removeColumn('pos_transactions', 'payment_collected_shift_id');
    await queryInterface.removeColumn('pos_transactions', 'payment_collected_by');
    await queryInterface.removeColumn('pos_transactions', 'payment_collected_at');
  }
};
