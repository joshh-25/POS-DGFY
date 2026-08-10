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
    if (!await tableExists(queryInterface, 'tenant_payment_accounts')) return;

    if (!await hasColumn(queryInterface, 'tenant_payment_accounts', 'wallet_status')) {
      await queryInterface.addColumn('tenant_payment_accounts', 'wallet_status', {
        type: Sequelize.ENUM('unknown', 'closed_loop', 'enabled', 'restricted'),
        allowNull: false,
        defaultValue: 'unknown'
      });
    }

    if (!await hasColumn(queryInterface, 'tenant_payment_accounts', 'wallet_verified_at')) {
      await queryInterface.addColumn('tenant_payment_accounts', 'wallet_verified_at', {
        type: Sequelize.DATE,
        allowNull: true
      });
    }
  },

  async down(queryInterface) {
    if (!await tableExists(queryInterface, 'tenant_payment_accounts')) return;
    if (await hasColumn(queryInterface, 'tenant_payment_accounts', 'wallet_verified_at')) {
      await queryInterface.removeColumn('tenant_payment_accounts', 'wallet_verified_at');
    }
    if (await hasColumn(queryInterface, 'tenant_payment_accounts', 'wallet_status')) {
      await queryInterface.removeColumn('tenant_payment_accounts', 'wallet_status');
    }
  }
};
