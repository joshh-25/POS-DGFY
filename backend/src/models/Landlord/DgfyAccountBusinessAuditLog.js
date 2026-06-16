import { DataTypes, Model } from 'sequelize';

export default (sequelize) => {
    class DgfyAccountBusinessAuditLog extends Model { }

    DgfyAccountBusinessAuditLog.init({
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
        tenant_id: {
            type: DataTypes.UUID,
            allowNull: true,
            references: {
                model: 'tenants',
                key: 'id'
            }
        },
        membership_id: {
            type: DataTypes.INTEGER,
            allowNull: true
        },
        action: {
            type: DataTypes.ENUM('company_switch_success', 'company_switch_failed', 'invitation_accept_success', 'invitation_accept_failed'),
            allowNull: false
        },
        result: {
            type: DataTypes.ENUM('success', 'failure'),
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
        metadata: {
            type: DataTypes.JSON,
            allowNull: true
        }
    }, {
        sequelize,
        modelName: 'DgfyAccountBusinessAuditLog',
        tableName: 'dgfy_account_business_audit_logs',
        underscored: true,
        timestamps: true,
        indexes: [
            { fields: ['dgfy_account_id', 'created_at'], name: 'idx_dgfy_business_audit_account_time' },
            { fields: ['tenant_id', 'created_at'], name: 'idx_dgfy_business_audit_tenant_time' },
            { fields: ['action'], name: 'idx_dgfy_business_audit_action' }
        ]
    });

    return DgfyAccountBusinessAuditLog;
};
