import { DataTypes, Model } from 'sequelize';

export default (sequelize) => {
  class CompanyRegistrationDraft extends Model {}

  CompanyRegistrationDraft.init({
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    dgfy_account_id: {
      type: DataTypes.UUID,
      allowNull: false
    },
    registration_email_snapshot: {
      type: DataTypes.STRING(255),
      allowNull: false
    },
    status: {
      type: DataTypes.ENUM('draft', 'pending_review', 'approved', 'rejected', 'abandoned'),
      allowNull: false,
      defaultValue: 'draft'
    },
    current_step: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 1
    },
    draft_payload: {
      type: DataTypes.JSON,
      allowNull: false,
      defaultValue: {}
    },
    submission_snapshot: {
      type: DataTypes.JSON,
      allowNull: true
    },
    legal_terms_snapshot: {
      type: DataTypes.JSON,
      allowNull: true
    },
    optimistic_version: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 1
    },
    submitted_at: {
      type: DataTypes.DATE,
      allowNull: true
    },
    reviewed_at: {
      type: DataTypes.DATE,
      allowNull: true
    },
    materialization_status: {
      type: DataTypes.ENUM('not_started', 'in_progress', 'succeeded', 'failed'),
      allowNull: false,
      defaultValue: 'not_started'
    },
    materialization_error: {
      type: DataTypes.STRING(1000),
      allowNull: true
    },
    materialization_snapshot: {
      type: DataTypes.JSON,
      allowNull: true
    },
    materialized_tenant_id: {
      type: DataTypes.UUID,
      allowNull: true
    },
    materialized_application_id: {
      type: DataTypes.UUID,
      allowNull: true
    },
    materialized_at: {
      type: DataTypes.DATE,
      allowNull: true
    }
  }, {
    sequelize,
    modelName: 'CompanyRegistrationDraft',
    tableName: 'company_registration_drafts',
    underscored: true,
    timestamps: true,
    indexes: [
      { fields: ['dgfy_account_id', 'status'], name: 'idx_registration_draft_owner_status' },
      { fields: ['dgfy_account_id', 'updated_at'], name: 'idx_registration_draft_owner_updated' },
      { fields: ['materialized_tenant_id'], name: 'idx_registration_draft_materialized_tenant' },
      { fields: ['materialized_application_id'], name: 'idx_registration_draft_materialized_application' }
    ]
  });

  return CompanyRegistrationDraft;
};
