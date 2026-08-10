import { DataTypes, Model } from 'sequelize';

export default (sequelize) => {
    class TenantComplianceArtifact extends Model { }

    TenantComplianceArtifact.init({
        tenant_compliance_artifact_id: {
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
        artifact_type: {
            type: DataTypes.ENUM(
                'bir_accreditation_certificate',
                'bir_ptu_document',
                'npc_dps_certificate',
                'bsp_ops_certificate',
                'ops_security_controls_attestation',
                'other'
            ),
            allowNull: false
        },
        artifact_name: {
            type: DataTypes.STRING(255),
            allowNull: false
        },
        reference_number: {
            type: DataTypes.STRING(120),
            allowNull: true
        },
        valid_from: {
            type: DataTypes.DATE,
            allowNull: true
        },
        valid_until: {
            type: DataTypes.DATE,
            allowNull: true
        },
        status: {
            type: DataTypes.ENUM('pending', 'valid', 'expired', 'revoked'),
            allowNull: false,
            defaultValue: 'pending'
        },
        verification_status: {
            type: DataTypes.ENUM('pending_review', 'verified', 'rejected', 'revoked'),
            allowNull: false,
            defaultValue: 'pending_review'
        },
        verified_by_actor_type: {
            type: DataTypes.ENUM('tenant_master_admin', 'platform_admin'),
            allowNull: true
        },
        verified_by_user_id: {
            type: DataTypes.INTEGER,
            allowNull: true
        },
        verified_at: {
            type: DataTypes.DATE,
            allowNull: true
        },
        verification_note: {
            type: DataTypes.TEXT,
            allowNull: true
        },
        verification_evidence_ref: {
            type: DataTypes.STRING(255),
            allowNull: true
        },
        metadata: {
            type: DataTypes.JSON,
            allowNull: true,
            defaultValue: {}
        }
    }, {
        sequelize,
        modelName: 'TenantComplianceArtifact',
        tableName: 'tenant_compliance_artifacts',
        underscored: true,
        timestamps: true,
        indexes: [
            { fields: ['tenant_id'] },
            { fields: ['artifact_type'] },
            { fields: ['status'] },
            { fields: ['verification_status'] },
            { fields: ['valid_until'] }
        ]
    });

    return TenantComplianceArtifact;
};
