import { DataTypes, Model } from 'sequelize';

export default (sequelize) => {
  class CompanyRegistrationAttempt extends Model { }
  CompanyRegistrationAttempt.init({
    id: { type: DataTypes.BIGINT, autoIncrement: true, primaryKey: true },
    application_id: { type: DataTypes.UUID, allowNull: false },
    attempt_no: { type: DataTypes.INTEGER, allowNull: false },
    submission_snapshot: { type: DataTypes.JSON, allowNull: false },
    legal_terms_snapshot: { type: DataTypes.JSON, allowNull: false },
    decision: { type: DataTypes.ENUM('pending', 'approved', 'rejected'), allowNull: false, defaultValue: 'pending' },
    denial_reason: { type: DataTypes.STRING(500), allowNull: true },
    actor_admin_id: { type: DataTypes.UUID, allowNull: true },
    actor_username_snapshot: { type: DataTypes.STRING(120), allowNull: true },
    decided_at: { type: DataTypes.DATE, allowNull: true },
    submitted_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW }
  }, { sequelize, modelName: 'CompanyRegistrationAttempt', tableName: 'company_registration_attempts', underscored: true, timestamps: true, indexes: [{ unique: true, fields: ['application_id', 'attempt_no'], name: 'unique_company_registration_attempt' }] });
  return CompanyRegistrationAttempt;
};
