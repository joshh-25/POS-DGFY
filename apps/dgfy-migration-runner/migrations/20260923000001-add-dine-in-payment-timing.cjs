'use strict';

const tableExists = async (queryInterface, tableName) => {
  const tables = await queryInterface.showAllTables();
  return tables.some((entry) => String(entry?.tableName || entry?.table_name || entry).toLowerCase() === tableName);
};

module.exports = {
  async up(queryInterface, Sequelize) {
    if (!await tableExists(queryInterface, 'pos_transactions')) return;

    const table = await queryInterface.describeTable('pos_transactions');
    if (!table.payment_timing) {
      await queryInterface.addColumn('pos_transactions', 'payment_timing', {
        type: Sequelize.ENUM('upfront', 'on_pickup', 'on_delivery', 'on_dine_in'),
        allowNull: true,
        defaultValue: null,
        after: 'payment_type'
      });
    }

    // Existing tenants may have rows written while the earlier timing column was nullable.
    // Normalize those rows before tightening the column so the migration remains safe on both
    // freshly migrated and partially repaired tenant schemas.
    await queryInterface.sequelize.query(`
      UPDATE pos_transactions
      SET payment_timing = 'upfront'
      WHERE payment_timing IS NULL
    `);

    await queryInterface.changeColumn('pos_transactions', 'payment_timing', {
      type: Sequelize.ENUM('upfront', 'on_pickup', 'on_delivery', 'on_dine_in'),
      allowNull: false,
      defaultValue: 'upfront'
    });
  },

  async down(queryInterface, Sequelize) {
    if (!await tableExists(queryInterface, 'pos_transactions')) return;

    const table = await queryInterface.describeTable('pos_transactions');
    if (!table.payment_timing) return;

    // A rollback intentionally normalizes the new value before narrowing the enum so MySQL
    // cannot fail while trying to remove a value that is still present in live rows.
    await queryInterface.sequelize.query(`
      UPDATE pos_transactions
      SET payment_timing = 'upfront'
      WHERE payment_timing = 'on_dine_in'
    `);
    await queryInterface.changeColumn('pos_transactions', 'payment_timing', {
      type: Sequelize.ENUM('upfront', 'on_pickup', 'on_delivery'),
      allowNull: false,
      defaultValue: 'upfront'
    });
  }
};
