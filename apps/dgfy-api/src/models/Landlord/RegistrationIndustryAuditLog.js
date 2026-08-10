import { DataTypes, Model } from 'sequelize';

// Landlord-only: audit trail for every admin write to the registration
// Industry catalog (issue #316) - create, edit, hide, unhide. Generalizes
// the Phase 39 visibility-only audit table (whose 'hidden'/'unhidden'
// values are a strict subset of this ENUM, so its rows copied over
// verbatim in migration 20260812000003). A dedicated table rather than
// reusing StoreConfigurationTemplateAuditLog - that table's template_id
// FK is required and this action targets an industry key, some of which
// have no template row at all.
export default (sequelize) => {
    class RegistrationIndustryAuditLog extends Model { }

    RegistrationIndustryAuditLog.init({
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
            type: DataTypes.ENUM('created', 'updated', 'hidden', 'unhidden'),
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
        modelName: 'RegistrationIndustryAuditLog',
        tableName: 'registration_industry_audit_logs',
        underscored: true,
        timestamps: true,
        indexes: [
            { fields: ['industry_key', 'created_at'], name: 'idx_registration_industry_audit_key_time' },
            { fields: ['action'], name: 'idx_registration_industry_audit_action' }
        ]
    });

    return RegistrationIndustryAuditLog;
};
