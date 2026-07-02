'use strict';

const addColumnIfMissing = async (queryInterface, table, column, definition) => {
  const description = await queryInterface.describeTable(table);
  if (!description[column]) await queryInterface.addColumn(table, column, definition);
};
const removeColumnIfPresent = async (queryInterface, table, column) => {
  const description = await queryInterface.describeTable(table);
  if (description[column]) await queryInterface.removeColumn(table, column);
};

module.exports = {
  async up(queryInterface, Sequelize) {
    await addColumnIfMissing(queryInterface, 'pos_catalog_overrides', 'pos_always_available', {
      type: Sequelize.BOOLEAN,
      allowNull: false,
      defaultValue: false,
      comment: 'POS-only stock exemption; never changes Storefront visibility or Inventory stock truth'
    });
    await addColumnIfMissing(queryInterface, 'pos_transaction_lines', 'stock_effect_type', {
      type: Sequelize.ENUM('inventory_issue', 'stock_exempt'),
      allowNull: false,
      defaultValue: 'inventory_issue',
      comment: 'Immutable checkout-time stock-effect classification'
    });
    await addColumnIfMissing(queryInterface, 'pos_transaction_lines', 'stock_exempt_reason', {
      type: Sequelize.STRING(80),
      allowNull: true,
      comment: 'Immutable reason when a POS sale line intentionally creates no inventory movement'
    });
  },

  async down(queryInterface) {
    await removeColumnIfPresent(queryInterface, 'pos_transaction_lines', 'stock_exempt_reason');
    await removeColumnIfPresent(queryInterface, 'pos_transaction_lines', 'stock_effect_type');
    await removeColumnIfPresent(queryInterface, 'pos_catalog_overrides', 'pos_always_available');
  }
};
