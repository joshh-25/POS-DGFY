'use strict';

const hasColumn = async (queryInterface, tableName, columnName) => {
  const definition = await queryInterface.describeTable(tableName).catch(() => ({}));
  return Object.prototype.hasOwnProperty.call(definition, columnName);
};

const addIndexSafe = async (queryInterface, tableName, fields, options = {}) => {
  const indexes = await queryInterface.showIndex(tableName).catch(() => []);
  if ((indexes || []).some((index) => index.name === options.name)) return;
  await queryInterface.addIndex(tableName, fields, options);
};

module.exports = {
  async up(queryInterface, Sequelize) {
    if (!(await hasColumn(queryInterface, 'job_orders', 'source_location_id'))) {
      await queryInterface.addColumn('job_orders', 'source_location_id', {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: { model: 'tenant_locations', key: 'location_id' },
        onDelete: 'SET NULL',
        onUpdate: 'CASCADE'
      });
    }
    if (!(await hasColumn(queryInterface, 'job_orders', 'destination_location_id'))) {
      await queryInterface.addColumn('job_orders', 'destination_location_id', {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: { model: 'tenant_locations', key: 'location_id' },
        onDelete: 'SET NULL',
        onUpdate: 'CASCADE'
      });
    }
    await addIndexSafe(queryInterface, 'job_orders', ['source_location_id'], {
      name: 'idx_job_orders_source_location_id'
    });
    await addIndexSafe(queryInterface, 'job_orders', ['destination_location_id'], {
      name: 'idx_job_orders_destination_location_id'
    });
  },

  async down(queryInterface) {
    const sourceExists = await hasColumn(queryInterface, 'job_orders', 'source_location_id');
    const destinationExists = await hasColumn(queryInterface, 'job_orders', 'destination_location_id');
    if (destinationExists) {
      await queryInterface.removeIndex('job_orders', 'idx_job_orders_destination_location_id').catch(() => {});
      await queryInterface.removeColumn('job_orders', 'destination_location_id');
    }
    if (sourceExists) {
      await queryInterface.removeIndex('job_orders', 'idx_job_orders_source_location_id').catch(() => {});
      await queryInterface.removeColumn('job_orders', 'source_location_id');
    }
  }
};
