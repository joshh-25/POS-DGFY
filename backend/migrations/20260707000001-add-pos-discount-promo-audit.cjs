'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    const columns = await queryInterface.describeTable('pos_transaction_discounts');
    if (!columns.promo_code) {
      await queryInterface.addColumn('pos_transaction_discounts', 'promo_code', {
        type: Sequelize.STRING(40),
        allowNull: true,
        comment: 'Commercial promo code validated by the server at checkout'
      });
      await queryInterface.addIndex('pos_transaction_discounts', ['promo_code'], {
        name: 'idx_pos_transaction_discounts_promo_code'
      });
    }
    await queryInterface.changeColumn('pos_transaction_discounts', 'calculation_version', {
      type: Sequelize.STRING(30),
      allowNull: false,
      defaultValue: 'pos-discount.v2'
    });
  },

  async down(queryInterface, Sequelize) {
    const columns = await queryInterface.describeTable('pos_transaction_discounts');
    if (columns.promo_code) {
      await queryInterface.removeIndex('pos_transaction_discounts', 'idx_pos_transaction_discounts_promo_code');
      await queryInterface.removeColumn('pos_transaction_discounts', 'promo_code');
    }
    await queryInterface.changeColumn('pos_transaction_discounts', 'calculation_version', {
      type: Sequelize.STRING(30),
      allowNull: false,
      defaultValue: 'pos-discount.v1'
    });
  }
};
