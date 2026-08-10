'use strict';

const tableExists = async (queryInterface, tableName) => {
  const table = await queryInterface.describeTable(tableName).catch(() => null);
  return Boolean(table);
};

const columnExists = async (queryInterface, tableName, columnName) => {
  const table = await queryInterface.describeTable(tableName).catch(() => null);
  return Boolean(table && table[columnName]);
};

const indexExists = async (queryInterface, tableName, indexName) => {
  const indexes = await queryInterface.showIndex(tableName).catch(() => []);
  return indexes.some((index) => index.name === indexName);
};

module.exports = {
  async up(queryInterface, Sequelize) {
    if (!(await tableExists(queryInterface, 'delivery_jobs'))) return;

    if (!(await columnExists(queryInterface, 'delivery_jobs', 'assigned_shift_id'))) {
      await queryInterface.addColumn('delivery_jobs', 'assigned_shift_id', {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: { model: 'pos_terminal_shifts', key: 'pos_terminal_shift_id' },
        onUpdate: 'RESTRICT',
        onDelete: 'SET NULL'
      });
    }

    if (!(await indexExists(queryInterface, 'delivery_jobs', 'idx_delivery_jobs_assignment_shift'))) {
      await queryInterface.addIndex('delivery_jobs', ['assigned_shift_id'], {
        name: 'idx_delivery_jobs_assignment_shift'
      });
    }
  },

  async down(queryInterface) {
    if (!(await tableExists(queryInterface, 'delivery_jobs'))) return;

    if (await indexExists(queryInterface, 'delivery_jobs', 'idx_delivery_jobs_assignment_shift')) {
      await queryInterface.removeIndex('delivery_jobs', 'idx_delivery_jobs_assignment_shift');
    }
    if (await columnExists(queryInterface, 'delivery_jobs', 'assigned_shift_id')) {
      await queryInterface.removeColumn('delivery_jobs', 'assigned_shift_id');
    }
  }
};
