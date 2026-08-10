import { DataTypes, Model } from 'sequelize';

export default (sequelize) => {
  class CompanyRegistrationEmailDelivery extends Model { }
  CompanyRegistrationEmailDelivery.init({
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    application_id: { type: DataTypes.UUID, allowNull: false },
    event_type: { type: DataTypes.STRING(80), allowNull: false },
    recipient_email_snapshot: { type: DataTypes.STRING(255), allowNull: false },
    status: { type: DataTypes.ENUM('queued', 'sent_to_provider', 'failed'), allowNull: false, defaultValue: 'queued' },
    provider_message_id: { type: DataTypes.STRING(255), allowNull: true },
    last_error_summary: { type: DataTypes.STRING(500), allowNull: true },
    sent_at: { type: DataTypes.DATE, allowNull: true }
  }, { sequelize, modelName: 'CompanyRegistrationEmailDelivery', tableName: 'company_registration_email_deliveries', underscored: true, timestamps: true });
  return CompanyRegistrationEmailDelivery;
};
