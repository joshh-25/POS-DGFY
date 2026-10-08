'use strict';

const normalizeTableName = (table) => {
  if (!table) return '';
  if (typeof table === 'string') return table;
  return table.tableName || table.table_name || String(table);
};

const tableExists = async (queryInterface, tableName) => {
  const tables = await queryInterface.showAllTables();
  return (tables || [])
    .map(normalizeTableName)
    .some((name) => String(name).toLowerCase() === String(tableName).toLowerCase());
};

const hasIndex = async (queryInterface, tableName, indexName) => {
  try {
    const indexes = await queryInterface.showIndex(tableName);
    return (indexes || []).some((index) => String(index.name).toLowerCase() === String(indexName).toLowerCase());
  } catch {
    return false;
  }
};

const addIndexIfMissing = async (queryInterface, tableName, fields, name) => {
  if (await hasIndex(queryInterface, tableName, name)) return;
  await queryInterface.addIndex(tableName, fields, { name });
};

const removeIndexIfExists = async (queryInterface, tableName, name) => {
  if (await hasIndex(queryInterface, tableName, name)) {
    await queryInterface.removeIndex(tableName, name);
  }
};

module.exports = {
  async up(queryInterface, Sequelize) {
    if (!await tableExists(queryInterface, 'company_registration_download_audits')) {
      await queryInterface.createTable('company_registration_download_audits', {
        id: { type: Sequelize.UUID, allowNull: false, primaryKey: true },
        registration_draft_id: { type: Sequelize.UUID, allowNull: false },
        tenant_id: { type: Sequelize.UUID, allowNull: true },
        upload_id: { type: Sequelize.UUID, allowNull: true },
        actor_admin_id: { type: Sequelize.UUID, allowNull: true },
        actor_username: { type: Sequelize.STRING(120), allowNull: false },
        action: { type: Sequelize.ENUM('individual_download', 'archive_download'), allowNull: false },
        file_count: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
        metadata: { type: Sequelize.JSON, allowNull: true },
        created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
        updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') }
      });
    }

    await addIndexIfMissing(queryInterface, 'company_registration_download_audits', ['registration_draft_id', 'created_at'], 'idx_registration_download_audit_draft_time');
    await addIndexIfMissing(queryInterface, 'company_registration_download_audits', ['tenant_id', 'created_at'], 'idx_registration_download_audit_tenant_time');
    await addIndexIfMissing(queryInterface, 'company_registration_download_audits', ['actor_admin_id', 'created_at'], 'idx_registration_download_audit_actor_time');
  },

  async down(queryInterface) {
    if (!await tableExists(queryInterface, 'company_registration_download_audits')) return;
    await removeIndexIfExists(queryInterface, 'company_registration_download_audits', 'idx_registration_download_audit_draft_time');
    await removeIndexIfExists(queryInterface, 'company_registration_download_audits', 'idx_registration_download_audit_tenant_time');
    await removeIndexIfExists(queryInterface, 'company_registration_download_audits', 'idx_registration_download_audit_actor_time');
    await queryInterface.dropTable('company_registration_download_audits');
    if (queryInterface.sequelize.getDialect() === 'postgres') {
      await queryInterface.sequelize.query('DROP TYPE IF EXISTS enum_company_registration_download_audits_action;');
    }
  }
};
