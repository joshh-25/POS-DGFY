import { Model, DataTypes } from 'sequelize';

export default (sequelize) => {
  class PartnerApp extends Model {}
  PartnerApp.init({
    id: { type: DataTypes.STRING(36), primaryKey: true, allowNull: false },
    app_slug: { type: DataTypes.STRING(96), allowNull: false, unique: true },
    display_name: { type: DataTypes.STRING(191), allowNull: false },
    status: { type: DataTypes.ENUM('pending', 'approved', 'suspended', 'retired'), allowNull: false, defaultValue: 'pending' }
  }, { sequelize, modelName: 'PartnerApp', tableName: 'partner_apps', underscored: true, timestamps: true });
  return PartnerApp;
};
