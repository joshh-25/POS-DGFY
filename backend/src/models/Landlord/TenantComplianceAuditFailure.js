import { DataTypes, Model } from 'sequelize';

export default (sequelize) => {
    class TenantComplianceAuditFailure extends Model { }

    TenantComplianceAuditFailure.init({
        tenant_compliance_audit_failure_id: {
            type: DataTypes.INTEGER,
            autoIncrement: true,
            primaryKey: true
        },
        tenant_id: {
            type: DataTypes.UUID,
            allowNull: true
        },
        event_type: {
            type: DataTypes.STRING(120),
            allowNull: false
        },
        operation: {
            type: DataTypes.STRING(120),
            allowNull: true
        },
        decision: {
            type: DataTypes.STRING(32),
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
        audit_payload: {
            type: DataTypes.JSON,
            allowNull: false,
            defaultValue: {}
        },
        fallback_context: {
            type: DataTypes.JSON,
            allowNull: false,
            defaultValue: {}
        },
        primary_error_message: {
            type: DataTypes.TEXT,
            allowNull: false
        },
        primary_error_name: {
            type: DataTypes.STRING(120),
            allowNull: true
        },
        primary_error_code: {
            type: DataTypes.STRING(120),
            allowNull: true
        },
        resolved_at: {
            type: DataTypes.DATE,
            allowNull: true
        }
    }, {
        sequelize,
        modelName: 'TenantComplianceAuditFailure',
        tableName: 'tenant_compliance_audit_failures',
        underscored: true,
        timestamps: true,
        indexes: [
            { fields: ['tenant_id'] },
            { fields: ['event_type'] },
            { fields: ['created_at'] },
            { fields: ['resolved_at'] }
        ]
    });

    return TenantComplianceAuditFailure;
};
