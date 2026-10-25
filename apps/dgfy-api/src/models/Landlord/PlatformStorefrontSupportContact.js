import { DataTypes, Model } from 'sequelize';

export default (sequelize) => {
  class PlatformStorefrontSupportContact extends Model {}

  PlatformStorefrontSupportContact.init({
    id: { type: DataTypes.INTEGER, primaryKey: true, allowNull: false },
    active_email: { type: DataTypes.STRING(254), allowNull: true },
    active_email_verified_at: { type: DataTypes.DATE, allowNull: true },
    monitoring_confirmed_at: { type: DataTypes.DATE, allowNull: true },
    monitoring_confirmed_by_admin_id: {
      type: DataTypes.UUID,
      allowNull: true,
      references: { model: 'platform_admin_users', key: 'id' },
      onDelete: 'SET NULL'
    },
    pending_email: { type: DataTypes.STRING(254), allowNull: true },
    updated_by_admin_id: {
      type: DataTypes.UUID,
      allowNull: true,
      references: { model: 'platform_admin_users', key: 'id' },
      onDelete: 'SET NULL'
    }
  }, {
    sequelize,
    modelName: 'PlatformStorefrontSupportContact',
    tableName: 'platform_storefront_support_contacts',
    underscored: true,
    timestamps: true
  });

  return PlatformStorefrontSupportContact;
};
