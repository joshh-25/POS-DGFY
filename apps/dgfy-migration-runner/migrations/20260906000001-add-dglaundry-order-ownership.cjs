// Bind DGFY-originated storefront orders to the immutable authenticated
// account that created them. Provider/counter projections remain nullable:
// they are never claimable by a customer merely because the reference is
// known.
module.exports = {
  async up(queryInterface, Sequelize) {
    const columns = await queryInterface.describeTable('dgfy_dglaundry_order_projections');
    if (!columns.dgfy_account_id) {
      await queryInterface.addColumn('dgfy_dglaundry_order_projections', 'dgfy_account_id', {
        type: Sequelize.STRING(160),
        allowNull: true,
        comment: 'Immutable DGFY account id; null for provider/counter-originated projections.'
      });
    }

    const indexes = await queryInterface.showIndex('dgfy_dglaundry_order_projections');
    const indexName = 'idx_dglaundry_order_account_scope';
    if (!(indexes || []).some((index) => index.name === indexName)) {
      await queryInterface.addIndex('dgfy_dglaundry_order_projections', [
        'dgfy_account_id',
        'company_id',
        'location_id',
        'external_order_reference'
      ], { name: indexName });
    }
  },

  async down(queryInterface) {
    const indexes = await queryInterface.showIndex('dgfy_dglaundry_order_projections');
    const indexName = 'idx_dglaundry_order_account_scope';
    if ((indexes || []).some((index) => index.name === indexName)) {
      await queryInterface.removeIndex('dgfy_dglaundry_order_projections', indexName);
    }
    const columns = await queryInterface.describeTable('dgfy_dglaundry_order_projections');
    if (columns.dgfy_account_id) {
      await queryInterface.removeColumn('dgfy_dglaundry_order_projections', 'dgfy_account_id');
    }
  }
};
