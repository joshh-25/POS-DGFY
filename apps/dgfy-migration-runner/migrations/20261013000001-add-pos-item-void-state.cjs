'use strict';

const TABLE = 'pos_transaction_lines';

const COLUMNS = {
  voided_quantity: {
    type: 'DECIMAL(24,12)',
    allowNull: false,
    defaultValue: 0,
    comment: 'Quantity voided from this POS transaction line'
  },
  voided_at: {
    type: 'DATETIME',
    allowNull: true,
    comment: 'Timestamp of the latest line-level void'
  },
  voided_by: {
    type: 'INTEGER',
    allowNull: true,
    comment: 'Actor responsible for the latest line-level void'
  },
  void_reason: {
    type: 'VARCHAR(255)',
    allowNull: true,
    comment: 'Reason for the latest line-level void'
  }
};

module.exports = {
  async up(queryInterface) {
    const description = await queryInterface.describeTable(TABLE);
    for (const [name, definition] of Object.entries(COLUMNS)) {
      if (description[name]) continue;
      await queryInterface.addColumn(TABLE, name, definition);
    }
  },

  async down(queryInterface) {
    const description = await queryInterface.describeTable(TABLE);
    for (const name of Object.keys(COLUMNS).reverse()) {
      if (description[name]) await queryInterface.removeColumn(TABLE, name);
    }
  }
};
