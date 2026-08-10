'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    if (!await queryInterface.describeTable('platform_invoice_payments').catch(() => null)) {
      await queryInterface.createTable('platform_invoice_payments', { id: { type: Sequelize.UUID, primaryKey: true, allowNull: false }, invoice_id: { type: Sequelize.UUID, allowNull: false, references: { model: 'platform_invoices', key: 'id' }, onDelete: 'RESTRICT' }, payment_type: { type: Sequelize.ENUM('cash', 'reversal', 'refund'), allowNull: false, defaultValue: 'cash' }, tendered_centavos: { type: Sequelize.BIGINT, allowNull: false }, amount_applied_centavos: { type: Sequelize.BIGINT, allowNull: false }, change_due_centavos: { type: Sequelize.BIGINT, allowNull: false, defaultValue: 0 }, change_returned_confirmed_at: { type: Sequelize.DATE, allowNull: true }, recorded_by_admin_id: { type: Sequelize.UUID, allowNull: true, references: { model: 'platform_admin_users', key: 'id' }, onDelete: 'RESTRICT' }, internal_note: { type: Sequelize.STRING(500), allowNull: true }, created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') }, updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') } });
      await queryInterface.addIndex('platform_invoice_payments', ['invoice_id', 'created_at'], { name: 'idx_platform_invoice_payment_invoice' });
    }
    if (!await queryInterface.describeTable('platform_invoice_sequences').catch(() => null)) await queryInterface.createTable('platform_invoice_sequences', { mode: { type: Sequelize.ENUM('qa', 'live'), primaryKey: true }, next_value: { type: Sequelize.BIGINT, allowNull: false, defaultValue: 1 }, created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') }, updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') } });
  },
  async down(queryInterface) { await queryInterface.dropTable('platform_invoice_payments').catch(() => {}); await queryInterface.dropTable('platform_invoice_sequences').catch(() => {}); }
};
