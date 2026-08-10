import { DataTypes, Model } from 'sequelize';

export default (sequelize) => {
  class PlatformAdminUser extends Model { }

  PlatformAdminUser.init({
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    username: { type: DataTypes.STRING(120), allowNull: false },
    username_normalized: { type: DataTypes.STRING(120), allowNull: false, unique: true },
    password_hash: { type: DataTypes.STRING(255), allowNull: false },
    is_master: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    auth_source: { type: DataTypes.ENUM('bootstrap_env', 'database'), allowNull: false },
    status: { type: DataTypes.ENUM('active', 'suspended', 'deleted'), allowNull: false, defaultValue: 'active' },
    temporary_password_active: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    password_changed_at: { type: DataTypes.DATE, allowNull: true },
    auth_version: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },
    created_by_admin_id: { type: DataTypes.UUID, allowNull: true },
    suspended_at: { type: DataTypes.DATE, allowNull: true },
    suspended_by_admin_id: { type: DataTypes.UUID, allowNull: true },
    suspension_reason: { type: DataTypes.STRING(500), allowNull: true },
    deleted_at: { type: DataTypes.DATE, allowNull: true },
    deleted_by_admin_id: { type: DataTypes.UUID, allowNull: true },
    deletion_reason: { type: DataTypes.STRING(500), allowNull: true }
  }, {
    sequelize,
    modelName: 'PlatformAdminUser',
    tableName: 'platform_admin_users',
    underscored: true,
    timestamps: true,
    indexes: [
      { unique: true, fields: ['username_normalized'], name: 'unique_platform_admin_username_normalized' },
      { fields: ['status'], name: 'idx_platform_admin_users_status' }
    ]
  });

  return PlatformAdminUser;
};
