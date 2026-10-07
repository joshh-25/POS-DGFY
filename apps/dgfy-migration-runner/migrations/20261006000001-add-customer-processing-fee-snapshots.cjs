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
    if (await tableExists(queryInterface, 'tenant_revenue_fee_policies')) {
      if (!await hasColumn(queryInterface, 'tenant_revenue_fee_policies', 'customer_processing_fee_policy')) {
        await queryInterface.addColumn('tenant_revenue_fee_policies', 'customer_processing_fee_policy', {
          type: Sequelize.JSON,
          allowNull: true,
          comment: 'Owner-configured item-processing fee policy snapshot; legacy column name retained'
        });
      }
    }

    if (await tableExists(queryInterface, 'commerce_payment_sessions')) {
      if (!await hasColumn(queryInterface, 'commerce_payment_sessions', 'customer_processing_fee_amount')) {
        await queryInterface.addColumn('commerce_payment_sessions', 'customer_processing_fee_amount', {
          type: Sequelize.DECIMAL(14, 4),
          allowNull: false,
          defaultValue: 0,
          comment: 'Item-processing fee captured in the checkout total; legacy column name retained'
        });
      }
      if (!await hasColumn(queryInterface, 'commerce_payment_sessions', 'customer_processing_fee_breakdown')) {
        await queryInterface.addColumn('commerce_payment_sessions', 'customer_processing_fee_breakdown', {
          type: Sequelize.JSON,
          allowNull: true,
          comment: 'Immutable item-processing fee calculation snapshot; legacy column name retained'
        });
      }
    }

    if (await tableExists(queryInterface, 'pos_transactions')) {
      if (!await hasColumn(queryInterface, 'pos_transactions', 'customer_processing_fee_amount')) {
        await queryInterface.addColumn('pos_transactions', 'customer_processing_fee_amount', {
          type: Sequelize.DECIMAL(14, 4),
          allowNull: false,
          defaultValue: 0,
          comment: 'Item-processing fee captured in the storefront order total; legacy column name retained'
        });
      }
      if (!await hasColumn(queryInterface, 'pos_transactions', 'customer_processing_fee_label_snapshot')) {
        await queryInterface.addColumn('pos_transactions', 'customer_processing_fee_label_snapshot', {
          type: Sequelize.STRING(80),
          allowNull: true,
          comment: 'Immutable item-processing fee label snapshot; legacy column name retained'
        });
      }
      if (!await hasColumn(queryInterface, 'pos_transactions', 'customer_processing_fee_breakdown')) {
        await queryInterface.addColumn('pos_transactions', 'customer_processing_fee_breakdown', {
          type: Sequelize.JSON,
          allowNull: true,
          comment: 'Immutable item-processing fee calculation snapshot; legacy column name retained'
        });
      }
    }
  },

  async down(queryInterface) {
    if (await tableExists(queryInterface, 'pos_transactions')) {
      if (await hasColumn(queryInterface, 'pos_transactions', 'customer_processing_fee_breakdown')) {
        await queryInterface.removeColumn('pos_transactions', 'customer_processing_fee_breakdown');
      }
      if (await hasColumn(queryInterface, 'pos_transactions', 'customer_processing_fee_label_snapshot')) {
        await queryInterface.removeColumn('pos_transactions', 'customer_processing_fee_label_snapshot');
      }
      if (await hasColumn(queryInterface, 'pos_transactions', 'customer_processing_fee_amount')) {
        await queryInterface.removeColumn('pos_transactions', 'customer_processing_fee_amount');
      }
    }
    if (await tableExists(queryInterface, 'commerce_payment_sessions')) {
      if (await hasColumn(queryInterface, 'commerce_payment_sessions', 'customer_processing_fee_breakdown')) {
        await queryInterface.removeColumn('commerce_payment_sessions', 'customer_processing_fee_breakdown');
      }
      if (await hasColumn(queryInterface, 'commerce_payment_sessions', 'customer_processing_fee_amount')) {
        await queryInterface.removeColumn('commerce_payment_sessions', 'customer_processing_fee_amount');
      }
    }
    if (await tableExists(queryInterface, 'tenant_revenue_fee_policies')
      && await hasColumn(queryInterface, 'tenant_revenue_fee_policies', 'customer_processing_fee_policy')) {
      await queryInterface.removeColumn('tenant_revenue_fee_policies', 'customer_processing_fee_policy');
    }
  }
};
