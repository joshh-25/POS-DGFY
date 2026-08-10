'use strict';

const tableExists = async (queryInterface, tableName) => {
  const tables = await queryInterface.showAllTables();
  return tables.map((table) => (typeof table === 'object' ? table.tableName : table)).includes(tableName);
};

const hasColumn = async (queryInterface, tableName, columnName) => {
  if (!await tableExists(queryInterface, tableName)) return false;
  const table = await queryInterface.describeTable(tableName);
  return Boolean(table[columnName]);
};

module.exports = {
  async up(queryInterface, Sequelize) {
    if (!await tableExists(queryInterface, 'commerce_payment_sessions')) return;
    if (!await hasColumn(queryInterface, 'commerce_payment_sessions', 'fee_policy')) {
      await queryInterface.addColumn('commerce_payment_sessions', 'fee_policy', {
        type: Sequelize.JSON,
        allowNull: true
      });
    }
  },

  async down(queryInterface) {
    if (!await tableExists(queryInterface, 'commerce_payment_sessions')) return;
    if (await hasColumn(queryInterface, 'commerce_payment_sessions', 'fee_policy')) {
      await queryInterface.removeColumn('commerce_payment_sessions', 'fee_policy');
    }
  }
};
