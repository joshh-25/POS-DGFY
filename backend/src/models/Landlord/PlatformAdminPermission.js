import { DataTypes, Model } from 'sequelize';

export default (sequelize) => {
  class PlatformAdminPermission extends Model { }
  PlatformAdminPermission.init({
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    admin_user_id: { type: DataTypes.UUID, allowNull: false },
    permission_key: { type: DataTypes.STRING(80), allowNull: false }
  }, {
    sequelize,
    modelName: 'PlatformAdminPermission',
    tableName: 'platform_admin_permissions',
    underscored: true,
    timestamps: true,
    indexes: [
      { unique: true, fields: ['admin_user_id', 'permission_key'], name: 'unique_platform_admin_permission' },
      { fields: ['permission_key'], name: 'idx_platform_admin_permission_key' }
    ]
  });
  return PlatformAdminPermission;
};
