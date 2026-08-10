import { DataTypes, Model } from 'sequelize';

export default (sequelize) => {
    class DgfyAccountAdminAuditLog extends Model { }

    DgfyAccountAdminAuditLog.init({
        audit_log_id: {
            type: DataTypes.BIGINT,
            autoIncrement: true,
            primaryKey: true
        },
        dgfy_account_id: {
            type: DataTypes.UUID,
            allowNull: false,
            references: {
                model: 'dgfy_accounts',
                key: 'id'
            }
        },
        action: {
            type: DataTypes.ENUM('profile_update', 'suspend', 'reactivate', 'delete', 'admin_create_dgfy_account', 'temporary_password_rotated'),
            allowNull: false
        },
        actor_username: {
            type: DataTypes.STRING(120),
            allowNull: false
        },
        reason: {
            type: DataTypes.STRING(500),
            allowNull: true
        },
        request_id: {
            type: DataTypes.STRING(100),
            allowNull: true
        },
        ip_address: {
            type: DataTypes.STRING(64),
            allowNull: true
        },
        user_agent: {
            type: DataTypes.STRING(500),
            allowNull: true
        },
        before_snapshot: {
            type: DataTypes.JSON,
            allowNull: true
        },
        after_snapshot: {
            type: DataTypes.JSON,
            allowNull: true
        }
    }, {
        sequelize,
        modelName: 'DgfyAccountAdminAuditLog',
        tableName: 'dgfy_account_admin_audit_logs',
        underscored: true,
        timestamps: true,
        indexes: [
            { fields: ['dgfy_account_id', 'created_at'], name: 'idx_dgfy_account_admin_audit_account_time' },
            { fields: ['action'], name: 'idx_dgfy_account_admin_audit_action' },
            { fields: ['actor_username'], name: 'idx_dgfy_account_admin_audit_actor' }
        ]
    });

    return DgfyAccountAdminAuditLog;
};
