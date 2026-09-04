'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    const tables = new Set((await queryInterface.showAllTables()).map((entry) => String(entry.tableName || entry).toLowerCase()));
    if (!tables.has('pos_transaction_discount_beneficiaries')) {
      await queryInterface.createTable('pos_transaction_discount_beneficiaries', {
        id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
        transaction_discount_id: { type: Sequelize.INTEGER, allowNull: false, references: { model: 'pos_transaction_discounts', key: 'id' }, onDelete: 'CASCADE' },
        category: { type: Sequelize.STRING(40), allowNull: false },
        customer_name: { type: Sequelize.STRING(255), allowNull: false },
        id_number: { type: Sequelize.STRING(120), allowNull: false },
        created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') }
      });
      await queryInterface.addIndex('pos_transaction_discount_beneficiaries', ['transaction_discount_id'], { name: 'idx_pos_discount_beneficiaries_discount' });
      await queryInterface.addIndex('pos_transaction_discount_beneficiaries', ['transaction_discount_id', 'id_number'], { unique: true, name: 'uq_pos_discount_beneficiary_id' });
    }

    const lines = await queryInterface.describeTable('pos_transaction_discount_lines');
    if (!lines.beneficiary_id) {
      await queryInterface.addColumn('pos_transaction_discount_lines', 'beneficiary_id', {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: { model: 'pos_transaction_discount_beneficiaries', key: 'id' },
        onDelete: 'CASCADE'
      });
      await queryInterface.addIndex('pos_transaction_discount_lines', ['beneficiary_id'], { name: 'idx_pos_discount_lines_beneficiary' });
    }
  },

  async down(queryInterface) {
    const tables = new Set((await queryInterface.showAllTables()).map((entry) => String(entry.tableName || entry).toLowerCase()));
    if (tables.has('pos_transaction_discount_lines')) {
      const lines = await queryInterface.describeTable('pos_transaction_discount_lines');
      if (lines.beneficiary_id) await queryInterface.removeColumn('pos_transaction_discount_lines', 'beneficiary_id');
    }
    if (tables.has('pos_transaction_discount_beneficiaries')) await queryInterface.dropTable('pos_transaction_discount_beneficiaries');
  }
};
