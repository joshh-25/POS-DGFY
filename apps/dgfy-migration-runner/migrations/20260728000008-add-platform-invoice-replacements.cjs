'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    const table = await queryInterface.describeTable('platform_invoices').catch(() => null);
    if (!table) return;
    await queryInterface.removeIndex('platform_invoices', 'unique_platform_invoice_original_application').catch(() => {});
    if (!table.parent_invoice_id) await queryInterface.addColumn('platform_invoices', 'parent_invoice_id', { type: Sequelize.UUID, allowNull: true, references: { model: 'platform_invoices', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'RESTRICT' });
    if (!table.invoice_kind) await queryInterface.addColumn('platform_invoices', 'invoice_kind', { type: Sequelize.ENUM('original', 'replacement'), allowNull: false, defaultValue: 'original' });
    await queryInterface.addIndex('platform_invoices', ['registration_application_id'], { name: 'idx_platform_invoice_application' }).catch(() => {});
    await queryInterface.addIndex('platform_invoices', ['parent_invoice_id'], { name: 'idx_platform_invoice_parent' }).catch(() => {});
  },
  async down(queryInterface) { await queryInterface.removeIndex('platform_invoices', 'idx_platform_invoice_parent').catch(() => {}); await queryInterface.removeIndex('platform_invoices', 'idx_platform_invoice_application').catch(() => {}); }
};
