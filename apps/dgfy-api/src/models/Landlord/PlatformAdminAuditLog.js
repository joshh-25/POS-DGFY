import { DataTypes, Model } from 'sequelize';

export default (sequelize) => {
  class PlatformAdminAuditLog extends Model { }
  PlatformAdminAuditLog.init({
    id: { type: DataTypes.BIGINT, autoIncrement: true, primaryKey: true },
    actor_admin_id: { type: DataTypes.UUID, allowNull: true },
    actor_username_snapshot: { type: DataTypes.STRING(120), allowNull: true },
    target_admin_id: { type: DataTypes.UUID, allowNull: true },
    target_username_snapshot: { type: DataTypes.STRING(120), allowNull: true },
    action: { type: DataTypes.STRING(100), allowNull: false },
    reason: { type: DataTypes.STRING(500), allowNull: true },
    before_snapshot: { type: DataTypes.JSON, allowNull: true },
    after_snapshot: { type: DataTypes.JSON, allowNull: true },
    request_metadata: { type: DataTypes.JSON, allowNull: true }
  }, {
    sequelize,
    modelName: 'PlatformAdminAuditLog',
    tableName: 'platform_admin_audit_logs',
    underscored: true,
    timestamps: true,
    updatedAt: false,
    indexes: [{ fields: ['target_admin_id', 'created_at'], name: 'idx_platform_admin_audit_target' }]
  });
  return PlatformAdminAuditLog;
};
