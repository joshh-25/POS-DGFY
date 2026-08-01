'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    if (!await queryInterface.describeTable('platform_invoice_artifacts').catch(() => null)) {
      await queryInterface.createTable('platform_invoice_artifacts', {
        id: { type: Sequelize.UUID, primaryKey: true, allowNull: false },
        invoice_id: { type: Sequelize.UUID, allowNull: false, references: { model: 'platform_invoices', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'RESTRICT' },
        artifact_type: { type: Sequelize.ENUM('issued_pdf'), allowNull: false },
        storage_key: { type: Sequelize.STRING(500), allowNull: false, unique: true },
        filename: { type: Sequelize.STRING(255), allowNull: false },
        content_type: { type: Sequelize.STRING(100), allowNull: false, defaultValue: 'application/pdf' },
        size_bytes: { type: Sequelize.INTEGER, allowNull: false }, sha256: { type: Sequelize.STRING(64), allowNull: false },
        created_by_admin_id: { type: Sequelize.UUID, allowNull: true, references: { model: 'platform_admin_users', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'RESTRICT' },
        created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
        updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') }
      });
      await queryInterface.addIndex('platform_invoice_artifacts', ['invoice_id', 'artifact_type'], { unique: true, name: 'unique_platform_invoice_artifact_type' });
    }
    if (!await queryInterface.describeTable('platform_invoice_deliveries').catch(() => null)) {
      await queryInterface.createTable('platform_invoice_deliveries', {
        id: { type: Sequelize.UUID, primaryKey: true, allowNull: false },
        invoice_id: { type: Sequelize.UUID, allowNull: false, references: { model: 'platform_invoices', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'RESTRICT' },
        artifact_id: { type: Sequelize.UUID, allowNull: false, references: { model: 'platform_invoice_artifacts', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'RESTRICT' },
        recipient_email_snapshot: { type: Sequelize.STRING(255), allowNull: false }, actual_recipient_email_snapshot: { type: Sequelize.STRING(255), allowNull: false }, status: { type: Sequelize.ENUM('queued', 'sent_to_provider', 'failed', 'delivered', 'bounced'), allowNull: false, defaultValue: 'queued' },
        provider: { type: Sequelize.STRING(40), allowNull: true }, provider_message_id: { type: Sequelize.STRING(255), allowNull: true }, last_error_summary: { type: Sequelize.STRING(500), allowNull: true },
        sent_at: { type: Sequelize.DATE, allowNull: true }, retry_after: { type: Sequelize.DATE, allowNull: true },
        requested_by_admin_id: { type: Sequelize.UUID, allowNull: true, references: { model: 'platform_admin_users', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'RESTRICT' },
        created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') }, updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') }
      });
      await queryInterface.addIndex('platform_invoice_deliveries', ['invoice_id', 'created_at'], { name: 'idx_platform_invoice_delivery_invoice' });
    }
  },
  async down(queryInterface) {
    await queryInterface.dropTable('platform_invoice_deliveries').catch(() => {});
    await queryInterface.dropTable('platform_invoice_artifacts').catch(() => {});
  }
};
