import { DataTypes, Model } from 'sequelize';

export default (sequelize) => {
  class SmsDeliveryLog extends Model { }

  SmsDeliveryLog.init({
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    dedupe_key: { type: DataTypes.STRING(128), allowNull: true, unique: true },
    provider: { type: DataTypes.STRING(40), allowNull: false },
    provider_message_id: { type: DataTypes.STRING(128), allowNull: true },
    purpose: { type: DataTypes.ENUM('transactional_order', 'promotional'), allowNull: true },
    tenant_id: { type: DataTypes.UUID, allowNull: true },
    order_id: { type: DataTypes.UUID, allowNull: true },
    recipient_phone: { type: DataTypes.STRING(32), allowNull: true },
    recipient_phone_hash: { type: DataTypes.STRING(64), allowNull: false },
    recipient_prefix: { type: DataTypes.STRING(12), allowNull: true },
    status: { type: DataTypes.ENUM('accepted', 'rejected', 'failed', 'unconfigured'), allowNull: false },
    simulated: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    error_code: { type: DataTypes.STRING(80), allowNull: true },
    error_message: { type: DataTypes.STRING(500), allowNull: true },
    pii_redacted_at: { type: DataTypes.DATE, allowNull: true },
    metadata: { type: DataTypes.JSON, allowNull: true },
    sent_at: { type: DataTypes.DATE, allowNull: false }
  }, {
    sequelize,
    modelName: 'SmsDeliveryLog',
    tableName: 'sms_delivery_logs',
    underscored: true,
    timestamps: true,
    indexes: [
      { fields: ['sent_at'], name: 'idx_sms_delivery_logs_sent_at' },
      { fields: ['status', 'sent_at'], name: 'idx_sms_delivery_logs_status_sent_at' },
      { fields: ['recipient_phone_hash', 'sent_at'], name: 'idx_sms_delivery_logs_recipient_hash' }
    ]
  });

  return SmsDeliveryLog;
};
