'use strict';

// Phase 137 (#819) -- ADR 0069 clause 4a (carried over verbatim from ADR 0068 clause 4a, unchanged
// by the supersession). Nullable-add -> backfill -> NOT NULL, same shape as
// 20260807000002-add-pos-payment-timing.cjs.

const tableExists = async (queryInterface, tableName) => {
  const tables = await queryInterface.showAllTables();
  return tables.some((entry) => String(entry?.tableName || entry?.table_name || entry).toLowerCase() === tableName);
};

module.exports = {
  async up(queryInterface, Sequelize) {
    if (!await tableExists(queryInterface, 'pos_transactions')) return;

    const table = await queryInterface.describeTable('pos_transactions');

    if (!table.amount_paid) {
      await queryInterface.addColumn('pos_transactions', 'amount_paid', {
        type: Sequelize.DECIMAL(14, 4),
        allowNull: true,
        defaultValue: null,
        after: 'total_amount'
      });
    }
    if (!table.balance_due) {
      await queryInterface.addColumn('pos_transactions', 'balance_due', {
        type: Sequelize.DECIMAL(14, 4),
        allowNull: true,
        defaultValue: null,
        after: 'amount_paid'
      });
    }

    await queryInterface.sequelize.query(`
      UPDATE pos_transactions
      SET
        amount_paid = CASE WHEN payment_status = 'paid' THEN total_amount ELSE 0 END,
        balance_due = CASE WHEN payment_status = 'paid' THEN 0 ELSE total_amount END
      WHERE amount_paid IS NULL OR balance_due IS NULL
    `);

    await queryInterface.changeColumn('pos_transactions', 'amount_paid', {
      type: Sequelize.DECIMAL(14, 4),
      allowNull: false,
      defaultValue: 0
    });
    await queryInterface.changeColumn('pos_transactions', 'balance_due', {
      type: Sequelize.DECIMAL(14, 4),
      allowNull: false,
      defaultValue: 0
    });
  },

  async down(queryInterface) {
    if (!await tableExists(queryInterface, 'pos_transactions')) return;

    const table = await queryInterface.describeTable('pos_transactions');
    if (table.balance_due) {
      await queryInterface.removeColumn('pos_transactions', 'balance_due');
    }
    if (table.amount_paid) {
      await queryInterface.removeColumn('pos_transactions', 'amount_paid');
    }
  }
};
