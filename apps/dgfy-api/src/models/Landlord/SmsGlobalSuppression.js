import { DataTypes, Model } from 'sequelize';

export default (sequelize) => {
  class SmsGlobalSuppression extends Model { }

  SmsGlobalSuppression.init({
    recipient_phone_hash: { type: DataTypes.STRING(64), primaryKey: true },
    reason: { type: DataTypes.STRING(80), allowNull: false },
    source: { type: DataTypes.ENUM('storefront_checkout', 'account_settings', 'pos', 'manual_api', 'provider_stop'), allowNull: false },
    actor_type: { type: DataTypes.STRING(40), allowNull: true },
    actor_id: { type: DataTypes.STRING(128), allowNull: true },
    created_at: { type: DataTypes.DATE, allowNull: false }
  }, {
    sequelize,
    modelName: 'SmsGlobalSuppression',
    tableName: 'sms_global_suppressions',
    underscored: true,
    timestamps: false
  });

  return SmsGlobalSuppression;
};
