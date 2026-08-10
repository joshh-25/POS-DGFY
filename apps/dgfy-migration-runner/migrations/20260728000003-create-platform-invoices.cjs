'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    if (await queryInterface.describeTable('platform_invoices').catch(() => null)) return;
    await queryInterface.createTable('platform_invoices', {
      id: { type: Sequelize.UUID, primaryKey: true, allowNull: false }, registration_application_id: { type: Sequelize.UUID, allowNull: false, references: { model: 'company_registration_applications', key: 'id' }, onDelete: 'RESTRICT' }, mode: { type: Sequelize.ENUM('qa', 'live'), allowNull: false, defaultValue: 'qa' }, invoice_number: { type: Sequelize.STRING(80), allowNull: true }, invoice_status: { type: Sequelize.ENUM('draft', 'issued', 'partially_credited', 'fully_credited'), allowNull: false, defaultValue: 'draft' }, payment_status: { type: Sequelize.ENUM('unpaid', 'partial', 'paid', 'partially_refunded', 'refunded'), allowNull: false, defaultValue: 'unpaid' }, currency: { type: Sequelize.STRING(3), allowNull: false, defaultValue: 'PHP' }, gross_centavos: { type: Sequelize.BIGINT, allowNull: false }, vat_centavos: { type: Sequelize.BIGINT, allowNull: false }, vatable_sales_centavos: { type: Sequelize.BIGINT, allowNull: false }, seller_snapshot: { type: Sequelize.JSON, allowNull: false }, buyer_snapshot: { type: Sequelize.JSON, allowNull: false }, service_snapshot: { type: Sequelize.JSON, allowNull: false }, recipient_email_snapshot: { type: Sequelize.STRING(255), allowNull: false }, issued_at: { type: Sequelize.DATE, allowNull: true }, created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') }, updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') }
    });
    await queryInterface.addIndex('platform_invoices', ['registration_application_id'], { unique: true, name: 'unique_platform_invoice_original_application' });
    await queryInterface.addIndex('platform_invoices', ['mode', 'invoice_status'], { name: 'idx_platform_invoice_mode_status' });
  },
  async down(queryInterface) { await queryInterface.dropTable('platform_invoices').catch(() => {}); }
};
