import { DataTypes, Model } from 'sequelize';

export default (sequelize) => {
  class CompanyRegistrationEvent extends Model { }
  CompanyRegistrationEvent.init({
    id: { type: DataTypes.BIGINT, autoIncrement: true, primaryKey: true },
    application_id: { type: DataTypes.UUID, allowNull: false },
    event_type: { type: DataTypes.STRING(80), allowNull: false },
    actor_type: { type: DataTypes.ENUM('applicant', 'platform_admin', 'system'), allowNull: false },
    actor_id: { type: DataTypes.UUID, allowNull: true },
    details: { type: DataTypes.JSON, allowNull: true }
  }, { sequelize, modelName: 'CompanyRegistrationEvent', tableName: 'company_registration_events', underscored: true, timestamps: true, updatedAt: false });
  return CompanyRegistrationEvent;
};
