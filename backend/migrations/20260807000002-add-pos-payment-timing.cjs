'use strict';

const tableExists = async (queryInterface, tableName) => {
  const tables = await queryInterface.showAllTables();
  return tables.some((entry) => String(entry?.tableName || entry?.table_name || entry).toLowerCase() === tableName);
};

const addIndexIfMissing = async (queryInterface, tableName, fields, options) => {
  const indexes = await queryInterface.showIndex(tableName);
  if (!(indexes || []).some((index) => index.name === options.name)) {
    await queryInterface.addIndex(tableName, fields, options);
  }
};

module.exports = {
  async up(queryInterface, Sequelize) {
    if (!await tableExists(queryInterface, 'pos_transactions')) return;

    const table = await queryInterface.describeTable('pos_transactions');
    if (!table.payment_timing) {
      await queryInterface.addColumn('pos_transactions', 'payment_timing', {
        type: Sequelize.ENUM('upfront', 'on_pickup', 'on_delivery'),
        allowNull: true,
        defaultValue: null,
        after: 'payment_type'
      });
    }

    await queryInterface.sequelize.query(`
      UPDATE pos_transactions
      SET payment_timing = CASE
        WHEN order_source = 'online_store' AND order_method = 'delivery' AND payment_type = 'cash' THEN 'on_delivery'
        WHEN order_source = 'online_store' AND order_method = 'pickup' AND payment_type = 'cash' THEN 'on_pickup'
        ELSE 'upfront'
      END
      WHERE payment_timing IS NULL
    `);

    await queryInterface.changeColumn('pos_transactions', 'payment_timing', {
      type: Sequelize.ENUM('upfront', 'on_pickup', 'on_delivery'),
      allowNull: false,
      defaultValue: 'upfront'
    });

    const refreshedTable = await queryInterface.describeTable('pos_transactions');
    const stateIndexFields = ['order_source', 'order_method', 'payment_timing', 'payment_status', 'fulfillment_status'];
    if (stateIndexFields.every((field) => refreshedTable[field])) {
      await addIndexIfMissing(
        queryInterface,
        'pos_transactions',
        stateIndexFields,
        { name: 'idx_pos_transactions_payment_timing_state' }
      );
    }
  },

  async down(queryInterface) {
    if (!await tableExists(queryInterface, 'pos_transactions')) return;

    const table = await queryInterface.describeTable('pos_transactions');
    try {
      await queryInterface.removeIndex('pos_transactions', 'idx_pos_transactions_payment_timing_state');
    } catch (_error) {
      // The index may not exist on partially provisioned legacy schemas.
    }
    if (table.payment_timing) {
      await queryInterface.removeColumn('pos_transactions', 'payment_timing');
    }
  }
};
