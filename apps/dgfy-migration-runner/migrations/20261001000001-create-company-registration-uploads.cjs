'use strict';

const tableExists = async (queryInterface, table) => Boolean(await queryInterface.describeTable(table).catch(() => null));
const addIndexIfMissing = async (queryInterface, table, fields, options) => {
  const indexes = await queryInterface.showIndex(table).catch(() => []);
  if (!indexes.some((index) => index.name === options.name)) await queryInterface.addIndex(table, fields, options);
};

module.exports = {
  async up(queryInterface, Sequelize) {
    if (!(await tableExists(queryInterface, 'company_registration_uploads'))) {
      await queryInterface.createTable('company_registration_uploads', {
        id: { type: Sequelize.UUID, primaryKey: true, allowNull: false },
        application_id: { type: Sequelize.UUID, allowNull: false, references: { model: 'company_registration_applications', key: 'id' }, onDelete: 'RESTRICT' },
        attempt_id: { type: Sequelize.BIGINT, allowNull: true, references: { model: 'company_registration_attempts', key: 'id' }, onDelete: 'RESTRICT' },
        asset_kind: { type: Sequelize.ENUM('menu', 'profile', 'cover', 'gallery'), allowNull: false },
        storage_key: { type: Sequelize.STRING(500), allowNull: true },
        original_filename: { type: Sequelize.STRING(255), allowNull: false },
        mime_type: { type: Sequelize.STRING(120), allowNull: false },
        byte_size: { type: Sequelize.BIGINT, allowNull: false },
        sha256: { type: Sequelize.STRING(64), allowNull: false },
        extraction_status: { type: Sequelize.ENUM('not_started', 'queued', 'processing', 'succeeded', 'failed', 'not_applicable'), allowNull: false, defaultValue: 'not_started' },
        review_status: { type: Sequelize.ENUM('pending', 'confirmed', 'rejected', 'revoked'), allowNull: false, defaultValue: 'pending' },
        expires_at: { type: Sequelize.DATE, allowNull: true },
        revoked_at: { type: Sequelize.DATE, allowNull: true },
        revoked_by_admin_id: { type: Sequelize.UUID, allowNull: true, references: { model: 'platform_admin_users', key: 'id' }, onDelete: 'RESTRICT' },
        purged_at: { type: Sequelize.DATE, allowNull: true },
        metadata: { type: Sequelize.JSON, allowNull: true },
        created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
        updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') }
      });
    }
    await addIndexIfMissing(queryInterface, 'company_registration_uploads', ['application_id', 'attempt_id'], { name: 'idx_company_registration_upload_application_attempt' });
    await addIndexIfMissing(queryInterface, 'company_registration_uploads', ['application_id', 'asset_kind', 'sha256'], { name: 'idx_company_registration_upload_dedupe' });
    await addIndexIfMissing(queryInterface, 'company_registration_uploads', ['application_id', 'attempt_id', 'asset_kind', 'sha256'], { name: 'unique_company_registration_upload_attempt_kind_hash', unique: true });
    await addIndexIfMissing(queryInterface, 'company_registration_uploads', ['review_status', 'expires_at'], { name: 'idx_company_registration_upload_expiry' });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('company_registration_uploads').catch(() => {});
  }
};

