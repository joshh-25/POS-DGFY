import { DataTypes, Model } from 'sequelize';

// Landlord-only: audit trail for every curation write against a
// StoreConfigurationTemplate (issue #178 Phase 14). Purpose-built rather
// than reusing TenantAdminAuditLog - that model's tenant_id FK is required
// and this action targets a template, not a tenant.
export default (sequelize) => {
    class StoreConfigurationTemplateAuditLog extends Model { }

    StoreConfigurationTemplateAuditLog.init({
        audit_log_id: {
            type: DataTypes.BIGINT,
            autoIncrement: true,
            primaryKey: true
        },
        template_id: {
            type: DataTypes.INTEGER,
            allowNull: false,
            references: {
                model: 'store_configuration_templates',
                key: 'template_id'
            }
        },
        action: {
            type: DataTypes.ENUM('draft_created', 'modules_updated', 'published', 'deprecated'),
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
        modelName: 'StoreConfigurationTemplateAuditLog',
        tableName: 'store_configuration_template_audit_logs',
        underscored: true,
        timestamps: true,
        indexes: [
            { fields: ['template_id', 'created_at'], name: 'idx_store_config_template_audit_template_time' },
            { fields: ['action'], name: 'idx_store_config_template_audit_action' }
        ]
    });

    return StoreConfigurationTemplateAuditLog;
};
