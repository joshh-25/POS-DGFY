import { DataTypes, Model } from 'sequelize';

export default (sequelize) => {
    class TenantAdminAuditLog extends Model { }

    TenantAdminAuditLog.init({
        tenant_admin_audit_log_id: {
            type: DataTypes.BIGINT,
            autoIncrement: true,
            primaryKey: true
        },
        tenant_id: {
            type: DataTypes.UUID,
            allowNull: false,
            references: {
                model: 'tenants',
                key: 'id'
            }
        },
        action: {
            type: DataTypes.ENUM('capability_update', 'pos_metadata_update'),
            allowNull: false
        },
        actor_username: {
            type: DataTypes.STRING(120),
            allowNull: false
        },
        reason: {
            type: DataTypes.STRING(500),
            allowNull: false
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
        },
        metadata: {
            type: DataTypes.JSON,
            allowNull: true,
            defaultValue: {}
        }
    }, {
        sequelize,
        modelName: 'TenantAdminAuditLog',
        tableName: 'tenant_admin_audit_logs',
        underscored: true,
        timestamps: true,
        indexes: [
            { fields: ['tenant_id', 'created_at'], name: 'idx_tenant_admin_audit_tenant_time' },
            { fields: ['action'], name: 'idx_tenant_admin_audit_action' },
            { fields: ['actor_username'], name: 'idx_tenant_admin_audit_actor' }
        ]
    });

    return TenantAdminAuditLog;
};
