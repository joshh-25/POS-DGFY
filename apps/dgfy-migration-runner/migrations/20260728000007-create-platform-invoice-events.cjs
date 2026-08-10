'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    if (await queryInterface.describeTable('platform_invoice_events').catch(() => null)) return;
    await queryInterface.createTable('platform_invoice_events', {
      id: { type: Sequelize.BIGINT, autoIncrement: true, primaryKey: true }, invoice_id: { type: Sequelize.UUID, allowNull: false, references: { model: 'platform_invoices', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'RESTRICT' },
      event_type: { type: Sequelize.STRING(80), allowNull: false }, actor_admin_id: { type: Sequelize.UUID, allowNull: true, references: { model: 'platform_admin_users', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'RESTRICT' }, details: { type: Sequelize.JSON, allowNull: true },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') }
    });
    await queryInterface.addIndex('platform_invoice_events', ['invoice_id', 'created_at'], { name: 'idx_platform_invoice_event_invoice' });
  },
  async down(queryInterface) { await queryInterface.dropTable('platform_invoice_events').catch(() => {}); }
};
