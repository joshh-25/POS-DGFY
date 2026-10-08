'use strict';

const describeTable = async (queryInterface, table) => (
  queryInterface.describeTable(table).catch(() => null)
);

const addColumnIfMissing = async (queryInterface, table, existingTable, name, definition) => {
  if (!existingTable[name]) {
    await queryInterface.addColumn(table, name, definition);
    existingTable[name] = definition;
  }
};

const changeColumnIfPresent = async (queryInterface, table, existingTable, name, definition) => {
  if (existingTable[name]) {
    await queryInterface.changeColumn(table, name, definition);
  }
};

const removeColumnIfExists = async (queryInterface, table, name) => {
  const existingTable = await describeTable(queryInterface, table);
  if (existingTable?.[name]) {
    await queryInterface.removeColumn(table, name).catch(() => {});
  }
};

const hasIndex = async (queryInterface, table, name) => {
  const indexes = await queryInterface.showIndex(table).catch(() => []);
  return indexes.some((index) => index.name === name);
};

const addIndexIfMissing = async (queryInterface, table, fields, options) => {
  if (!await hasIndex(queryInterface, table, options.name)) {
    await queryInterface.addIndex(table, fields, options);
  }
};

const removeIndexIfExists = async (queryInterface, table, name) => {
  if (await hasIndex(queryInterface, table, name)) {
    await queryInterface.removeIndex(table, name).catch(() => {});
  }
};

const legacyColumns = (Sequelize) => ({
  application_id: { type: Sequelize.UUID, allowNull: true, references: { model: 'company_registration_applications', key: 'id' }, onDelete: 'RESTRICT' },
  attempt_id: { type: Sequelize.BIGINT, allowNull: true, references: { model: 'company_registration_attempts', key: 'id' }, onDelete: 'RESTRICT' },
  asset_kind: { type: Sequelize.ENUM('menu', 'profile', 'cover', 'gallery'), allowNull: true },
  original_filename: { type: Sequelize.STRING(255), allowNull: true },
  byte_size: { type: Sequelize.BIGINT, allowNull: true },
  review_status: { type: Sequelize.ENUM('pending', 'confirmed', 'rejected', 'revoked'), allowNull: true, defaultValue: 'pending' },
  expires_at: { type: Sequelize.DATE, allowNull: true },
  revoked_at: { type: Sequelize.DATE, allowNull: true },
  revoked_by_admin_id: { type: Sequelize.UUID, allowNull: true, references: { model: 'platform_admin_users', key: 'id' }, onDelete: 'RESTRICT' },
  purged_at: { type: Sequelize.DATE, allowNull: true },
  metadata: { type: Sequelize.JSON, allowNull: true }
});

const draftColumns = (Sequelize) => ({
  registration_draft_id: { type: Sequelize.UUID, allowNull: true, references: { model: 'company_registration_drafts', key: 'id' }, onDelete: 'RESTRICT' },
  dgfy_account_id: { type: Sequelize.UUID, allowNull: true, references: { model: 'dgfy_accounts', key: 'id' }, onDelete: 'RESTRICT' },
  category: { type: Sequelize.ENUM('profile_image', 'cover_image', 'gallery_image', 'menu_upload'), allowNull: true },
  original_name: { type: Sequelize.STRING(255), allowNull: true },
  sanitized_name: { type: Sequelize.STRING(255), allowNull: true },
  file_size: { type: Sequelize.BIGINT, allowNull: true },
  upload_status: { type: Sequelize.ENUM('uploaded', 'ready_for_review', 'processing', 'processed', 'failed', 'removed'), allowNull: true, defaultValue: 'uploaded' },
  validation_status: { type: Sequelize.ENUM('pending', 'passed', 'failed'), allowNull: true, defaultValue: 'pending' },
  error_message: { type: Sequelize.STRING(500), allowNull: true },
  position: { type: Sequelize.INTEGER, allowNull: true, defaultValue: 0 },
  uploaded_at: { type: Sequelize.DATE, allowNull: true, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
  removed_at: { type: Sequelize.DATE, allowNull: true },
  removed_by_account_id: { type: Sequelize.UUID, allowNull: true }
});

const DRAFT_COLUMN_NAMES = [
  'registration_draft_id',
  'dgfy_account_id',
  'category',
  'original_name',
  'sanitized_name',
  'file_size',
  'upload_status',
  'validation_status',
  'error_message',
  'position',
  'uploaded_at',
  'removed_at',
  'removed_by_account_id'
];

module.exports = {
  async up(queryInterface, Sequelize) {
    const table = 'company_registration_uploads';
    const existingTable = await describeTable(queryInterface, table);
    if (!existingTable) return;

    for (const [name, definition] of Object.entries(legacyColumns(Sequelize))) {
      await addColumnIfMissing(queryInterface, table, existingTable, name, definition);
    }
    for (const [name, definition] of Object.entries(draftColumns(Sequelize))) {
      await addColumnIfMissing(queryInterface, table, existingTable, name, definition);
    }

    // Draft rows do not have an application/attempt identity or the legacy
    // asset naming fields. Make those established columns nullable while
    // retaining all existing application rows and constraints.
    await changeColumnIfPresent(queryInterface, table, existingTable, 'application_id', legacyColumns(Sequelize).application_id);
    await changeColumnIfPresent(queryInterface, table, existingTable, 'asset_kind', legacyColumns(Sequelize).asset_kind);
    await changeColumnIfPresent(queryInterface, table, existingTable, 'storage_key', { type: Sequelize.STRING(512), allowNull: true });
    await changeColumnIfPresent(queryInterface, table, existingTable, 'original_filename', legacyColumns(Sequelize).original_filename);
    await changeColumnIfPresent(queryInterface, table, existingTable, 'mime_type', { type: Sequelize.STRING(120), allowNull: true });
    await changeColumnIfPresent(queryInterface, table, existingTable, 'byte_size', legacyColumns(Sequelize).byte_size);
    await changeColumnIfPresent(queryInterface, table, existingTable, 'sha256', { type: Sequelize.STRING(64), allowNull: true });
    await changeColumnIfPresent(queryInterface, table, existingTable, 'extraction_status', {
      type: Sequelize.ENUM('not_started', 'queued', 'processing', 'succeeded', 'failed', 'not_applicable', 'pending', 'processed'),
      allowNull: true,
      defaultValue: 'not_started'
    });
    await changeColumnIfPresent(queryInterface, table, existingTable, 'review_status', legacyColumns(Sequelize).review_status);

    await addIndexIfMissing(queryInterface, table, ['application_id', 'attempt_id'], { name: 'idx_company_registration_upload_application_attempt' });
    await addIndexIfMissing(queryInterface, table, ['application_id', 'asset_kind', 'sha256'], { name: 'idx_company_registration_upload_dedupe' });
    await addIndexIfMissing(queryInterface, table, ['application_id', 'attempt_id', 'asset_kind', 'sha256'], { unique: true, name: 'unique_company_registration_upload_attempt_kind_hash' });
    await addIndexIfMissing(queryInterface, table, ['review_status', 'expires_at'], { name: 'idx_company_registration_upload_expiry' });
    await addIndexIfMissing(queryInterface, table, ['registration_draft_id', 'category', 'upload_status'], { name: 'idx_registration_upload_draft_category_status' });
    await addIndexIfMissing(queryInterface, table, ['dgfy_account_id', 'created_at'], { name: 'idx_registration_upload_owner_created' });
  },

  async down(queryInterface) {
    const table = 'company_registration_uploads';
    if (!await describeTable(queryInterface, table)) return;

    await removeIndexIfExists(queryInterface, table, 'idx_registration_upload_draft_category_status');
    await removeIndexIfExists(queryInterface, table, 'idx_registration_upload_owner_created');
    for (const name of DRAFT_COLUMN_NAMES) {
      await removeColumnIfExists(queryInterface, table, name);
    }
  }
};
