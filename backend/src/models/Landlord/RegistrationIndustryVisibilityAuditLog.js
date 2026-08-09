import { DataTypes, Model } from 'sequelize';

// Landlord-only: audit trail for every admin toggle of a registration
// Industry's visibility (issue #178 Phase 39). A dedicated table rather
// than reusing StoreConfigurationTemplateAuditLog - that table's
// template_id FK is required and this action targets an industry key,
// four of which have no template row at all.
export default (sequelize) => {
    class RegistrationIndustryVisibilityAuditLog extends Model { }

    RegistrationIndustryVisibilityAuditLog.init({
        audit_log_id: {
            type: DataTypes.BIGINT,
            autoIncrement: true,
            primaryKey: true
        },
        industry_key: {
            type: DataTypes.STRING(80),
            allowNull: false
        },
        action: {
            type: DataTypes.ENUM('hidden', 'unhidden'),
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
        modelName: 'RegistrationIndustryVisibilityAuditLog',
        tableName: 'registration_industry_visibility_audit_logs',
        underscored: true,
        timestamps: true,
        indexes: [
            { fields: ['industry_key', 'created_at'], name: 'idx_registration_industry_visibility_audit_key_time' },
            { fields: ['action'], name: 'idx_registration_industry_visibility_audit_action' }
        ]
    });

    return RegistrationIndustryVisibilityAuditLog;
};
