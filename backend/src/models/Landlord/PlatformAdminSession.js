import { DataTypes, Model } from 'sequelize';

export default (sequelize) => {
  class PlatformAdminSession extends Model { }
  PlatformAdminSession.init({
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    admin_user_id: { type: DataTypes.UUID, allowNull: false },
    auth_version: { type: DataTypes.INTEGER, allowNull: false },
    issued_at: { type: DataTypes.DATE, allowNull: false },
    expires_at: { type: DataTypes.DATE, allowNull: false },
    revoked_at: { type: DataTypes.DATE, allowNull: true },
    revoked_reason: { type: DataTypes.STRING(160), allowNull: true },
    ip_hash: { type: DataTypes.STRING(128), allowNull: true },
    user_agent_hash: { type: DataTypes.STRING(128), allowNull: true }
  }, {
    sequelize,
    modelName: 'PlatformAdminSession',
    tableName: 'platform_admin_sessions',
    underscored: true,
    timestamps: true,
    indexes: [
      { fields: ['admin_user_id', 'revoked_at'], name: 'idx_platform_admin_sessions_active' },
      { fields: ['expires_at'], name: 'idx_platform_admin_sessions_expiry' }
    ]
  });
  return PlatformAdminSession;
};
