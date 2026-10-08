import { DataTypes, Model } from 'sequelize';

export default (sequelize) => {
  class CompanyRegistrationDownloadAudit extends Model {}

  CompanyRegistrationDownloadAudit.init({
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    registration_draft_id: {
      type: DataTypes.UUID,
      allowNull: false
    },
    tenant_id: {
      type: DataTypes.UUID,
      allowNull: true
    },
    upload_id: {
      type: DataTypes.UUID,
      allowNull: true
    },
    actor_admin_id: {
      type: DataTypes.UUID,
      allowNull: true
    },
    actor_username: {
      type: DataTypes.STRING(120),
      allowNull: false
    },
    action: {
      type: DataTypes.ENUM('individual_download', 'archive_download'),
      allowNull: false
    },
    file_count: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0
    },
    metadata: {
      type: DataTypes.JSON,
      allowNull: true,
      defaultValue: {}
    }
  }, {
    sequelize,
    modelName: 'CompanyRegistrationDownloadAudit',
    tableName: 'company_registration_download_audits',
    underscored: true,
    timestamps: true,
    indexes: [
      { fields: ['registration_draft_id', 'created_at'], name: 'idx_registration_download_audit_draft_time' },
      { fields: ['tenant_id', 'created_at'], name: 'idx_registration_download_audit_tenant_time' },
      { fields: ['actor_admin_id', 'created_at'], name: 'idx_registration_download_audit_actor_time' }
    ]
  });

  return CompanyRegistrationDownloadAudit;
};
