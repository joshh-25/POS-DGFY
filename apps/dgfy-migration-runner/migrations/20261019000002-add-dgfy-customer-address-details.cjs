'use strict';

const TABLE = 'dgfy_customer_addresses';

const describeTable = async (queryInterface, tableName) => (
  queryInterface.describeTable(tableName).catch(() => null)
);

// #2594: the customer's own house number, Blk/Lot, unit or building, kept apart from the
// geocoded `address_line` so a saved address can restore both parts of the delivery address.
// Nullable with no backfill: addresses saved before this column have no details, and checkout
// asks the customer for them when one is used.
module.exports = {
  async up(queryInterface, Sequelize) {
    const columns = await describeTable(queryInterface, TABLE);
    if (columns && !columns.address_details) {
      await queryInterface.addColumn(TABLE, 'address_details', {
        type: Sequelize.STRING(255),
        allowNull: true,
        after: 'address_line',
        comment: 'Customer-entered house number, Blk/Lot, unit or building (#2594)'
      });
    }
  },

  async down(queryInterface) {
    const columns = await describeTable(queryInterface, TABLE);
    if (columns?.address_details) {
      await queryInterface.removeColumn(TABLE, 'address_details');
    }
  }
};
