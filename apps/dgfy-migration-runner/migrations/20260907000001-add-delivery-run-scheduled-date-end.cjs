'use strict';

// Phase 260 (#1489) -- extends delivery_runs to carry a date RANGE instead of a single
// scheduled_date. A NULL scheduled_date_end means the run is still a single-day run (its
// effective end equals scheduled_date) -- app-level range checks live in
// buildCreateDeliveryRunUseCase/buildUpdateDeliveryRunUseCase, not a DB CHECK constraint (kept
// out of this migration per implementation resolution: the app-level checks are sufficient and
// keep this migration minimal, matching the existing nullable-column-only shape of sibling
// migrations in this file's neighborhood).

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

const addColumnIfMissing = async (queryInterface, tableName, columnName, definition) => {
  if (await columnExists(queryInterface, tableName, columnName)) return;
  await queryInterface.addColumn(tableName, columnName, definition);
};

const addIndexIfMissing = async (queryInterface, tableName, fields, options) => {
  if (await indexExists(queryInterface, tableName, options.name)) return;
  await queryInterface.addIndex(tableName, fields, options);
};

module.exports = {
  async up(queryInterface, Sequelize) {
    if (!(await tableExists(queryInterface, 'delivery_runs'))) return;

    await addColumnIfMissing(queryInterface, 'delivery_runs', 'scheduled_date_end', {
      type: Sequelize.DATEONLY,
      allowNull: true
    });

    // idx_delivery_runs_status_scheduled covered ['status', 'scheduled_date'] -- now that
    // scheduled_date marks the start of a range, replace it with a 3-column composite so the
    // index name doesn't misleadingly imply a single point in time.
    if (await indexExists(queryInterface, 'delivery_runs', 'idx_delivery_runs_status_scheduled')) {
      await queryInterface.removeIndex('delivery_runs', 'idx_delivery_runs_status_scheduled');
    }
    await addIndexIfMissing(
      queryInterface,
      'delivery_runs',
      ['status', 'scheduled_date', 'scheduled_date_end'],
      { name: 'idx_delivery_runs_status_scheduled_range' }
    );
  },

  async down(queryInterface, Sequelize) {
    if (!(await tableExists(queryInterface, 'delivery_runs'))) return;

    if (await indexExists(queryInterface, 'delivery_runs', 'idx_delivery_runs_status_scheduled_range')) {
      await queryInterface.removeIndex('delivery_runs', 'idx_delivery_runs_status_scheduled_range');
    }
    await addIndexIfMissing(queryInterface, 'delivery_runs', ['status', 'scheduled_date'], {
      name: 'idx_delivery_runs_status_scheduled'
    });

    if (await columnExists(queryInterface, 'delivery_runs', 'scheduled_date_end')) {
      await queryInterface.removeColumn('delivery_runs', 'scheduled_date_end');
    }
  }
};
