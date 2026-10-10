import { DataTypes, Model } from 'sequelize';

export default (sequelize) => {
  class SmsConsentEvent extends Model { }

  SmsConsentEvent.init({
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    tenant_id: { type: DataTypes.UUID, allowNull: false },
    recipient_phone_hash: { type: DataTypes.STRING(64), allowNull: false },
    event: { type: DataTypes.ENUM('granted', 'revoked'), allowNull: false },
    source: { type: DataTypes.ENUM('storefront_checkout', 'account_settings', 'pos', 'manual_api', 'provider_stop'), allowNull: false },
    actor_type: { type: DataTypes.STRING(40), allowNull: true },
    actor_id: { type: DataTypes.STRING(128), allowNull: true },
    consent_text_version: { type: DataTypes.STRING(40), allowNull: true },
    occurred_at: { type: DataTypes.DATE, allowNull: false }
  }, {
    sequelize,
    modelName: 'SmsConsentEvent',
    tableName: 'sms_consent_events',
    underscored: true,
    timestamps: false,
    indexes: [{ fields: ['tenant_id', 'recipient_phone_hash', 'occurred_at'], name: 'idx_sms_consent_events_tenant_phone_time' }]
  });

  return SmsConsentEvent;
};
