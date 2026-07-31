'use strict';

const tableName = 'tenant_revenue_transactions';

const describeTableSafe = async (queryInterface) => (
  queryInterface.describeTable(tableName).catch(() => null)
);

module.exports = {
  async up(queryInterface, Sequelize) {
    const table = await describeTableSafe(queryInterface);
    if (!table) return;

    if (!table.fulfillment_status) {
      await queryInterface.addColumn(tableName, 'fulfillment_status', {
        type: Sequelize.ENUM('pending', 'completed', 'rejected', 'cancelled'),
        allowNull: false,
        defaultValue: 'pending',
        after: 'eligibility_at'
      });
    }
    if (!table.fulfilled_at) {
      await queryInterface.addColumn(tableName, 'fulfilled_at', {
        type: Sequelize.DATE,
        allowNull: true,
        after: 'fulfillment_status'
      });
    }
    if (!table.fulfillment_updated_at) {
      await queryInterface.addColumn(tableName, 'fulfillment_updated_at', {
        type: Sequelize.DATE,
        allowNull: true,
        after: 'fulfilled_at'
      });
    }

    await queryInterface.sequelize.query(
      `UPDATE ${tableName}
       SET settlement_status = 'on_hold'
       WHERE fulfillment_status = 'pending'
         AND settlement_status IN ('pending', 'eligible')`
    );

    const indexes = await queryInterface.showIndex(tableName).catch(() => []);
    if (!indexes.some((index) => index.name === 'idx_tenant_revenue_fulfillment_settlement')) {
      await queryInterface.addIndex(
        tableName,
        ['tenant_id', 'fulfillment_status', 'settlement_status', 'eligibility_at'],
        { name: 'idx_tenant_revenue_fulfillment_settlement' }
      );
    }
  },

  async down(queryInterface) {
    const table = await describeTableSafe(queryInterface);
    if (!table) return;

    await queryInterface.removeIndex(
      tableName,
      'idx_tenant_revenue_fulfillment_settlement'
    ).catch(() => {});
    if (table.fulfillment_updated_at) {
      await queryInterface.removeColumn(tableName, 'fulfillment_updated_at');
    }
    if (table.fulfilled_at) {
      await queryInterface.removeColumn(tableName, 'fulfilled_at');
    }
    if (table.fulfillment_status) {
      await queryInterface.removeColumn(tableName, 'fulfillment_status');
    }
  }
};
