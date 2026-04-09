import { DataTypes, Model } from 'sequelize';

export default (sequelize) => {
    class TenantComplianceAuditLog extends Model { }

    TenantComplianceAuditLog.init({
        tenant_compliance_audit_log_id: {
            type: DataTypes.INTEGER,
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
        event_type: {
            type: DataTypes.ENUM(
                'mode_selection',
                'mode_upgrade',
                'mode_activation',
                'blocked_operation',
                'artifact_expiry',
                'device_mismatch',
                'preflight_evaluation',
                'security_login',
                'security_logout',
                'security_sensitive_action',
                'security_signal'
            ),
            allowNull: false
        },
        operation: {
            type: DataTypes.STRING(120),
            allowNull: true
        },
        decision: {
            type: DataTypes.ENUM('allow', 'deny', 'requires_setup'),
            allowNull: true
        },
        reason_code: {
            type: DataTypes.STRING(120),
            allowNull: true
        },
        actor_user_id: {
            type: DataTypes.INTEGER,
            allowNull: true
        },
        metadata: {
            type: DataTypes.JSON,
            allowNull: true,
            defaultValue: {}
        }
    }, {
        sequelize,
        modelName: 'TenantComplianceAuditLog',
        tableName: 'tenant_compliance_audit_logs',
        underscored: true,
        timestamps: true,
        indexes: [
            { fields: ['tenant_id'] },
            { fields: ['event_type'] },
            { fields: ['decision'] },
            { fields: ['created_at'] }
        ]
    });

    return TenantComplianceAuditLog;
};
