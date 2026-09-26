'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    const columns = await queryInterface.describeTable('dgfy_customer_activities');
    if (!columns.location_id) {
      await queryInterface.addColumn('dgfy_customer_activities', 'location_id', {
        type: Sequelize.INTEGER,
        allowNull: true,
        comment: 'Tenant branch/location snapshot for branch-scoped customer history; null for legacy or non-location activities.'
      });
    }

    const indexName = 'idx_dgfy_customer_activities_account_store_location_time';
    const indexes = await queryInterface.showIndex('dgfy_customer_activities');
    if (!(indexes || []).some((index) => index.name === indexName)) {
      await queryInterface.addIndex('dgfy_customer_activities', [
        'dgfy_account_id',
        'store_slug',
        'location_id',
        'occurred_at'
      ], { name: indexName });
    }
  },

  async down(queryInterface) {
    const indexName = 'idx_dgfy_customer_activities_account_store_location_time';
    const indexes = await queryInterface.showIndex('dgfy_customer_activities');
    if ((indexes || []).some((index) => index.name === indexName)) {
      await queryInterface.removeIndex('dgfy_customer_activities', indexName);
    }
    const columns = await queryInterface.describeTable('dgfy_customer_activities');
    if (columns.location_id) await queryInterface.removeColumn('dgfy_customer_activities', 'location_id');
  }
};
