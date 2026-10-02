import { DataTypes, Model } from 'sequelize';

export default (sequelize) => {
  class CompanyRegistrationUpload extends Model { }
  CompanyRegistrationUpload.init({
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    application_id: { type: DataTypes.UUID, allowNull: false },
    attempt_id: { type: DataTypes.BIGINT, allowNull: true },
    asset_kind: { type: DataTypes.ENUM('menu', 'profile', 'cover', 'gallery'), allowNull: false },
    storage_key: { type: DataTypes.STRING(500), allowNull: true },
    original_filename: { type: DataTypes.STRING(255), allowNull: false },
    mime_type: { type: DataTypes.STRING(120), allowNull: false },
    byte_size: { type: DataTypes.BIGINT, allowNull: false },
    sha256: { type: DataTypes.STRING(64), allowNull: false },
    extraction_status: { type: DataTypes.ENUM('not_started', 'queued', 'processing', 'succeeded', 'failed', 'not_applicable'), allowNull: false, defaultValue: 'not_started' },
    review_status: { type: DataTypes.ENUM('pending', 'confirmed', 'rejected', 'revoked'), allowNull: false, defaultValue: 'pending' },
    expires_at: { type: DataTypes.DATE, allowNull: true },
    revoked_at: { type: DataTypes.DATE, allowNull: true },
    revoked_by_admin_id: { type: DataTypes.UUID, allowNull: true },
    purged_at: { type: DataTypes.DATE, allowNull: true },
    metadata: { type: DataTypes.JSON, allowNull: true }
  }, { sequelize, modelName: 'CompanyRegistrationUpload', tableName: 'company_registration_uploads', underscored: true, timestamps: true });
  return CompanyRegistrationUpload;
};

