import { DataTypes, Model } from 'sequelize';

export default (sequelize) => {
  class ContactInquiryProviderConfig extends Model {}

  ContactInquiryProviderConfig.init({
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    provider_key: { type: DataTypes.STRING(32), allowNull: false, unique: true },
    encrypted_api_key: { type: DataTypes.TEXT, allowNull: false },
    updated_by_admin_id: {
      type: DataTypes.UUID,
      allowNull: true,
      references: { model: 'platform_admin_users', key: 'id' },
      onDelete: 'SET NULL'
    }
  }, {
    sequelize,
    modelName: 'ContactInquiryProviderConfig',
    tableName: 'contact_inquiry_provider_configs',
    underscored: true,
    timestamps: true
  });

  return ContactInquiryProviderConfig;
};
