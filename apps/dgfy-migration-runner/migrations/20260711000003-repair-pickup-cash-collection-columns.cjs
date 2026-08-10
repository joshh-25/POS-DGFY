'use strict';

// Repairs databases where the original pickup-cash migration was recorded as
// applied before both collection-context columns were created.
module.exports = {
  async up(queryInterface, Sequelize) {
    const table = await queryInterface.describeTable('pos_transactions');

    if (!table.payment_collected_shift_id) {
      await queryInterface.addColumn('pos_transactions', 'payment_collected_shift_id', {
        type: Sequelize.INTEGER,
        allowNull: true
      });
    }

    if (!table.payment_collected_terminal_id) {
      await queryInterface.addColumn('pos_transactions', 'payment_collected_terminal_id', {
        type: Sequelize.STRING(100),
        allowNull: true
      });
    }
  },

  async down(queryInterface) {
    const table = await queryInterface.describeTable('pos_transactions');
    if (table.payment_collected_terminal_id) {
      await queryInterface.removeColumn('pos_transactions', 'payment_collected_terminal_id');
    }
    if (table.payment_collected_shift_id) {
      await queryInterface.removeColumn('pos_transactions', 'payment_collected_shift_id');
    }
  }
};
