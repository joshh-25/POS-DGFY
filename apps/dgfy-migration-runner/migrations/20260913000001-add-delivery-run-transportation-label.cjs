'use strict';

// Phase 329 (#1463): an optional display-only transportation descriptor for delivery runs.

const tableExists = async (queryInterface, tableName) => {
  const table = await queryInterface.describeTable(tableName).catch(() => null);
  return Boolean(table);
};

const columnExists = async (queryInterface, tableName, columnName) => {
  const table = await queryInterface.describeTable(tableName).catch(() => null);
  return Boolean(table && table[columnName]);
};

const addColumnIfMissing = async (queryInterface, tableName, columnName, definition) => {
  if (await columnExists(queryInterface, tableName, columnName)) return;
  await queryInterface.addColumn(tableName, columnName, definition);
};

module.exports = {
  async up(queryInterface, Sequelize) {
    if (!(await tableExists(queryInterface, 'delivery_runs'))) return;

    await addColumnIfMissing(queryInterface, 'delivery_runs', 'transportation_label', {
      type: Sequelize.STRING(120),
      allowNull: true
    });
  },

  async down(queryInterface) {
    if (!(await tableExists(queryInterface, 'delivery_runs'))) return;

    if (await columnExists(queryInterface, 'delivery_runs', 'transportation_label')) {
      await queryInterface.removeColumn('delivery_runs', 'transportation_label');
    }
  }
};
