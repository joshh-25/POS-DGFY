import { DataTypes, Model } from 'sequelize';

export default (sequelize) => {
  class CompanyRegistrationApplication extends Model { }
  CompanyRegistrationApplication.init({
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    tenant_id: { type: DataTypes.UUID, allowNull: false, unique: true },
    dgfy_account_id: { type: DataTypes.UUID, allowNull: false },
    registration_email_snapshot: { type: DataTypes.STRING(255), allowNull: false },
    current_attempt_no: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },
    review_status: { type: DataTypes.ENUM('pending', 'approved', 'rejected'), allowNull: false, defaultValue: 'pending' },
    provisioning_status: { type: DataTypes.ENUM('not_started', 'in_progress', 'succeeded', 'failed'), allowNull: false, defaultValue: 'not_started' },
    optimistic_version: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 }
  }, { sequelize, modelName: 'CompanyRegistrationApplication', tableName: 'company_registration_applications', underscored: true, timestamps: true });
  return CompanyRegistrationApplication;
};
