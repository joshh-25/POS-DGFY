'use strict';

const addIndexIfMissing = async (queryInterface, tableName, fields, options) => {
  const indexes = await queryInterface.showIndex(tableName).catch(() => []);
  if (indexes.some((index) => index.name === options.name)) return;
  await queryInterface.addIndex(tableName, fields, options);
};

module.exports = {
  async up(queryInterface, Sequelize) {
    const tables = await queryInterface.showAllTables();
    const tableNames = tables.map((table) => (typeof table === 'object' ? table.tableName || table.name : table));
    if (tableNames.includes('sms_delivery_logs')) return;

    await queryInterface.createTable('sms_delivery_logs', {
      id: { type: Sequelize.UUID, defaultValue: Sequelize.UUIDV4, primaryKey: true },
      dedupe_key: { type: Sequelize.STRING(128), allowNull: true, unique: true },
      provider: { type: Sequelize.STRING(40), allowNull: false },
      provider_message_id: { type: Sequelize.STRING(128), allowNull: true },
      purpose: { type: Sequelize.ENUM('transactional_order', 'promotional'), allowNull: true },
      tenant_id: { type: Sequelize.UUID, allowNull: true },
      order_id: { type: Sequelize.UUID, allowNull: true },
      recipient_phone: { type: Sequelize.STRING(32), allowNull: true },
      recipient_phone_hash: { type: Sequelize.STRING(64), allowNull: false },
      recipient_prefix: { type: Sequelize.STRING(12), allowNull: true },
      status: { type: Sequelize.ENUM('accepted', 'rejected', 'failed', 'unconfigured'), allowNull: false },
      simulated: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
      error_code: { type: Sequelize.STRING(80), allowNull: true },
      error_message: { type: Sequelize.STRING(500), allowNull: true },
      pii_redacted_at: { type: Sequelize.DATE, allowNull: true },
      metadata: { type: Sequelize.JSON, allowNull: true },
      sent_at: { type: Sequelize.DATE, allowNull: false },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
      updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP') }
    });

    await addIndexIfMissing(queryInterface, 'sms_delivery_logs', ['sent_at'], { name: 'idx_sms_delivery_logs_sent_at' });
    await addIndexIfMissing(queryInterface, 'sms_delivery_logs', ['status', 'sent_at'], { name: 'idx_sms_delivery_logs_status_sent_at' });
    await addIndexIfMissing(queryInterface, 'sms_delivery_logs', ['recipient_phone_hash', 'sent_at'], { name: 'idx_sms_delivery_logs_recipient_hash' });
  },

  async down(queryInterface) {
    const tables = await queryInterface.showAllTables();
    const tableNames = tables.map((table) => (typeof table === 'object' ? table.tableName || table.name : table));
    if (!tableNames.includes('sms_delivery_logs')) return;
    await queryInterface.dropTable('sms_delivery_logs');
    if (queryInterface.sequelize.getDialect() === 'mysql') {
      await queryInterface.sequelize.query('DROP TYPE IF EXISTS enum_sms_delivery_logs_purpose').catch(() => {});
      await queryInterface.sequelize.query('DROP TYPE IF EXISTS enum_sms_delivery_logs_status').catch(() => {});
    }
  }
};
