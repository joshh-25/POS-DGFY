'use strict';

const TABLES = ['sms_marketing_consents', 'sms_consent_events', 'sms_global_suppressions'];
const SOURCE = ['storefront_checkout', 'account_settings', 'pos', 'manual_api', 'provider_stop'];

const getTableNames = async (queryInterface) => {
  const tables = await queryInterface.showAllTables();
  return new Set(tables.map((table) => (typeof table === 'object' ? table.tableName || table.name : table)));
};

module.exports = {
  async up(queryInterface, Sequelize) {
    const tables = await getTableNames(queryInterface);
    if (!tables.has('sms_marketing_consents')) {
      await queryInterface.createTable('sms_marketing_consents', {
        id: { type: Sequelize.UUID, defaultValue: Sequelize.UUIDV4, primaryKey: true },
        tenant_id: { type: Sequelize.UUID, allowNull: false },
        recipient_phone_hash: { type: Sequelize.STRING(64), allowNull: false },
        recipient_prefix: { type: Sequelize.STRING(12), allowNull: true },
        status: { type: Sequelize.ENUM('active', 'revoked'), allowNull: false },
        source: { type: Sequelize.ENUM(...SOURCE), allowNull: false },
        actor_type: { type: Sequelize.STRING(40), allowNull: true },
        actor_id: { type: Sequelize.STRING(128), allowNull: true },
        consent_text_version: { type: Sequelize.STRING(40), allowNull: true },
        granted_at: { type: Sequelize.DATE, allowNull: true },
        revoked_at: { type: Sequelize.DATE, allowNull: true },
        created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
        updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP') }
      });
      await queryInterface.addIndex('sms_marketing_consents', ['tenant_id', 'recipient_phone_hash'], { unique: true, name: 'uq_sms_marketing_consents_tenant_phone' });
    }

    if (!tables.has('sms_consent_events')) {
      await queryInterface.createTable('sms_consent_events', {
        id: { type: Sequelize.UUID, defaultValue: Sequelize.UUIDV4, primaryKey: true },
        tenant_id: { type: Sequelize.UUID, allowNull: false },
        recipient_phone_hash: { type: Sequelize.STRING(64), allowNull: false },
        event: { type: Sequelize.ENUM('granted', 'revoked'), allowNull: false },
        source: { type: Sequelize.ENUM(...SOURCE), allowNull: false },
        actor_type: { type: Sequelize.STRING(40), allowNull: true },
        actor_id: { type: Sequelize.STRING(128), allowNull: true },
        consent_text_version: { type: Sequelize.STRING(40), allowNull: true },
        occurred_at: { type: Sequelize.DATE, allowNull: false }
      });
      await queryInterface.addIndex('sms_consent_events', ['tenant_id', 'recipient_phone_hash', 'occurred_at'], { name: 'idx_sms_consent_events_tenant_phone_time' });
    }

    if (!tables.has('sms_global_suppressions')) {
      await queryInterface.createTable('sms_global_suppressions', {
        recipient_phone_hash: { type: Sequelize.STRING(64), primaryKey: true },
        reason: { type: Sequelize.STRING(80), allowNull: false },
        source: { type: Sequelize.ENUM(...SOURCE), allowNull: false },
        actor_type: { type: Sequelize.STRING(40), allowNull: true },
        actor_id: { type: Sequelize.STRING(128), allowNull: true },
        created_at: { type: Sequelize.DATE, allowNull: false }
      });
    }
  },

  async down(queryInterface) {
    const tables = await getTableNames(queryInterface);
    for (const table of [...TABLES].reverse()) if (tables.has(table)) await queryInterface.dropTable(table);
    if (queryInterface.sequelize.getDialect() === 'mysql') {
      for (const enumName of ['enum_sms_marketing_consents_status', 'enum_sms_marketing_consents_source', 'enum_sms_consent_events_event', 'enum_sms_consent_events_source', 'enum_sms_global_suppressions_source']) {
        await queryInterface.sequelize.query(`DROP TYPE IF EXISTS ${enumName}`).catch(() => {});
      }
    }
  }
};
