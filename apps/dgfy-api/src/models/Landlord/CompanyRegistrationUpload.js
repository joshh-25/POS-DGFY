import { DataTypes, Model } from 'sequelize';

// This table serves both registration pipelines:
// - application/attempt uploads from the established registration flow; and
// - draft uploads from the newer storefront registration wizard.
// The two pipelines intentionally use separate foreign-key and presentation
// columns so existing application records remain readable while drafts can be
// reviewed and materialized independently.
export default (sequelize) => {
  class CompanyRegistrationUpload extends Model {}

  CompanyRegistrationUpload.init({
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    application_id: { type: DataTypes.UUID, allowNull: true },
    attempt_id: { type: DataTypes.BIGINT, allowNull: true },
    asset_kind: { type: DataTypes.ENUM('menu', 'profile', 'cover', 'gallery'), allowNull: true },
    registration_draft_id: { type: DataTypes.UUID, allowNull: true },
    dgfy_account_id: { type: DataTypes.UUID, allowNull: true },
    category: { type: DataTypes.ENUM('profile_image', 'cover_image', 'gallery_image', 'menu_upload'), allowNull: true },
    storage_key: { type: DataTypes.STRING(512), allowNull: true },
    original_filename: { type: DataTypes.STRING(255), allowNull: true },
    original_name: { type: DataTypes.STRING(255), allowNull: true },
    sanitized_name: { type: DataTypes.STRING(255), allowNull: true },
    mime_type: { type: DataTypes.STRING(120), allowNull: true },
    byte_size: { type: DataTypes.BIGINT, allowNull: true },
    file_size: { type: DataTypes.BIGINT, allowNull: true },
    sha256: { type: DataTypes.STRING(64), allowNull: true },
    extraction_status: {
      type: DataTypes.ENUM('not_started', 'queued', 'processing', 'succeeded', 'failed', 'not_applicable', 'pending', 'processed'),
      allowNull: true,
      defaultValue: 'not_started'
    },
    review_status: {
      type: DataTypes.ENUM('pending', 'confirmed', 'rejected', 'revoked'),
      allowNull: true,
      defaultValue: 'pending'
    },
    upload_status: {
      type: DataTypes.ENUM('uploaded', 'ready_for_review', 'processing', 'processed', 'failed', 'removed'),
      allowNull: true,
      defaultValue: 'uploaded'
    },
    validation_status: {
      type: DataTypes.ENUM('pending', 'passed', 'failed'),
      allowNull: true,
      defaultValue: 'pending'
    },
    error_message: { type: DataTypes.STRING(500), allowNull: true },
    position: { type: DataTypes.INTEGER, allowNull: true, defaultValue: 0 },
    uploaded_at: { type: DataTypes.DATE, allowNull: true, defaultValue: DataTypes.NOW },
    expires_at: { type: DataTypes.DATE, allowNull: true },
    revoked_at: { type: DataTypes.DATE, allowNull: true },
    revoked_by_admin_id: { type: DataTypes.UUID, allowNull: true },
    removed_at: { type: DataTypes.DATE, allowNull: true },
    removed_by_account_id: { type: DataTypes.UUID, allowNull: true },
    purged_at: { type: DataTypes.DATE, allowNull: true },
    metadata: { type: DataTypes.JSON, allowNull: true }
  }, {
    sequelize,
    modelName: 'CompanyRegistrationUpload',
    tableName: 'company_registration_uploads',
    underscored: true,
    timestamps: true,
    indexes: [
      { fields: ['application_id', 'attempt_id'], name: 'idx_company_registration_upload_application_attempt' },
      { fields: ['application_id', 'asset_kind', 'sha256'], name: 'idx_company_registration_upload_dedupe' },
      { fields: ['application_id', 'attempt_id', 'asset_kind', 'sha256'], unique: true, name: 'unique_company_registration_upload_attempt_kind_hash' },
      { fields: ['review_status', 'expires_at'], name: 'idx_company_registration_upload_expiry' },
      { fields: ['registration_draft_id', 'category', 'upload_status'], name: 'idx_registration_upload_draft_category_status' },
      { fields: ['dgfy_account_id', 'created_at'], name: 'idx_registration_upload_owner_created' }
    ]
  });

  return CompanyRegistrationUpload;
};
