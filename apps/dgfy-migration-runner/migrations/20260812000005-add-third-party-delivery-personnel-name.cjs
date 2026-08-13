'use strict';

const tableExists = async (queryInterface, tableName) => {
  const table = await queryInterface.describeTable(tableName).catch(() => null);
  return Boolean(table);
};

const columnExists = async (queryInterface, tableName, columnName) => {
  const table = await queryInterface.describeTable(tableName).catch(() => null);
  return Boolean(table && table[columnName]);
};

module.exports = {
  async up(queryInterface, Sequelize) {
    if (!(await tableExists(queryInterface, 'delivery_jobs'))) return;

    if (!(await columnExists(queryInterface, 'delivery_jobs', 'delivery_personnel_name'))) {
      await queryInterface.addColumn('delivery_jobs', 'delivery_personnel_name', {
        type: Sequelize.STRING(255),
        allowNull: true
      });
    }
  },

  async down(queryInterface) {
    if (!(await tableExists(queryInterface, 'delivery_jobs'))) return;

    if (await columnExists(queryInterface, 'delivery_jobs', 'delivery_personnel_name')) {
      await queryInterface.removeColumn('delivery_jobs', 'delivery_personnel_name');
    }
  }
};
