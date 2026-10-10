import { DataTypes, Model } from 'sequelize';

export default (sequelize) => {
  class SmsMarketingConsent extends Model { }

  SmsMarketingConsent.init({
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    tenant_id: { type: DataTypes.UUID, allowNull: false },
    recipient_phone_hash: { type: DataTypes.STRING(64), allowNull: false },
    recipient_prefix: { type: DataTypes.STRING(12), allowNull: true },
    status: { type: DataTypes.ENUM('active', 'revoked'), allowNull: false },
    source: { type: DataTypes.ENUM('storefront_checkout', 'account_settings', 'pos', 'manual_api', 'provider_stop'), allowNull: false },
    actor_type: { type: DataTypes.STRING(40), allowNull: true },
    actor_id: { type: DataTypes.STRING(128), allowNull: true },
    consent_text_version: { type: DataTypes.STRING(40), allowNull: true },
    granted_at: { type: DataTypes.DATE, allowNull: true },
    revoked_at: { type: DataTypes.DATE, allowNull: true }
  }, {
    sequelize,
    modelName: 'SmsMarketingConsent',
    tableName: 'sms_marketing_consents',
    underscored: true,
    timestamps: true,
    indexes: [{ unique: true, fields: ['tenant_id', 'recipient_phone_hash'], name: 'uq_sms_marketing_consents_tenant_phone' }]
  });

  return SmsMarketingConsent;
};
