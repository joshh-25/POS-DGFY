'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    if (await queryInterface.describeTable('platform_invoice_adjustments').catch(() => null)) return;
    await queryInterface.createTable('platform_invoice_adjustments', {
      id: { type: Sequelize.UUID, primaryKey: true, allowNull: false },
      invoice_id: { type: Sequelize.UUID, allowNull: false, references: { model: 'platform_invoices', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'RESTRICT' },
      adjustment_type: { type: Sequelize.ENUM('full_credit'), allowNull: false }, reason: { type: Sequelize.STRING(500), allowNull: false }, amount_centavos: { type: Sequelize.BIGINT, allowNull: false },
      confirmed_at: { type: Sequelize.DATE, allowNull: false }, created_by_admin_id: { type: Sequelize.UUID, allowNull: true, references: { model: 'platform_admin_users', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'RESTRICT' },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') }, updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') }
    });
    await queryInterface.addIndex('platform_invoice_adjustments', ['invoice_id', 'created_at'], { name: 'idx_platform_invoice_adjustment_invoice' });
  },
  async down(queryInterface) { await queryInterface.dropTable('platform_invoice_adjustments').catch(() => {}); }
};
