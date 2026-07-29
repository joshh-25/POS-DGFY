import { DataTypes, Model } from 'sequelize';

export default (sequelize) => {
  class PlatformInvoiceDelivery extends Model { }
  PlatformInvoiceDelivery.init({
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true }, invoice_id: { type: DataTypes.UUID, allowNull: false }, artifact_id: { type: DataTypes.UUID, allowNull: false },
    recipient_email_snapshot: { type: DataTypes.STRING(255), allowNull: false }, actual_recipient_email_snapshot: { type: DataTypes.STRING(255), allowNull: false }, status: { type: DataTypes.ENUM('queued', 'sent_to_provider', 'failed', 'delivered', 'bounced'), allowNull: false, defaultValue: 'queued' },
    provider: { type: DataTypes.STRING(40), allowNull: true }, provider_message_id: { type: DataTypes.STRING(255), allowNull: true }, last_error_summary: { type: DataTypes.STRING(500), allowNull: true }, sent_at: { type: DataTypes.DATE, allowNull: true }, retry_after: { type: DataTypes.DATE, allowNull: true }, requested_by_admin_id: { type: DataTypes.UUID, allowNull: true }
  }, { sequelize, modelName: 'PlatformInvoiceDelivery', tableName: 'platform_invoice_deliveries', underscored: true, timestamps: true, indexes: [{ fields: ['invoice_id', 'created_at'], name: 'idx_platform_invoice_delivery_invoice' }] });
  return PlatformInvoiceDelivery;
};
