import { DataTypes, Model } from 'sequelize';

export default (sequelize) => {
    class TenantComplianceFinalReviewDocument extends Model { }

    TenantComplianceFinalReviewDocument.init({
        tenant_compliance_final_review_document_id: {
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
        requirement_code: {
            type: DataTypes.ENUM(
                'submission_system_flow_diagram_mmd',
                'submission_system_flow_diagram_png',
                'submission_software_specification',
                'submission_backup_dr_plan',
                'submission_filing_instructions',
                'evidence_restore_drill',
                'evidence_encryption_verification'
            ),
            allowNull: false
        },
        source_type: {
            type: DataTypes.ENUM('upload', 'external_url'),
            allowNull: true
        },
        external_url: {
            type: DataTypes.STRING(1000),
            allowNull: true
        },
        file_name: {
            type: DataTypes.STRING(255),
            allowNull: true
        },
        file_path: {
            type: DataTypes.STRING(800),
            allowNull: true
        },
        mime_type: {
            type: DataTypes.STRING(120),
            allowNull: true
        },
        file_size_bytes: {
            type: DataTypes.BIGINT,
            allowNull: true
        },
        freshness_date: {
            type: DataTypes.DATE,
            allowNull: true
        },
        status: {
            type: DataTypes.ENUM('auto_valid', 'invalid', 'revoked'),
            allowNull: false,
            defaultValue: 'invalid'
        },
        review_state: {
            type: DataTypes.ENUM('pending_review', 'review_noted', 'revoked'),
            allowNull: false,
            defaultValue: 'pending_review'
        },
        review_note: {
            type: DataTypes.TEXT,
            allowNull: true
        },
        reviewed_by_actor_type: {
            type: DataTypes.ENUM('platform_admin'),
            allowNull: true
        },
        reviewed_by_user_id: {
            type: DataTypes.INTEGER,
            allowNull: true
        },
        reviewed_at: {
            type: DataTypes.DATE,
            allowNull: true
        },
        parsed_metadata: {
            type: DataTypes.JSON,
            allowNull: true,
            defaultValue: {}
        }
    }, {
        sequelize,
        modelName: 'TenantComplianceFinalReviewDocument',
        tableName: 'tenant_compliance_final_review_documents',
        underscored: true,
        timestamps: true,
        indexes: [
            { fields: ['tenant_id'] },
            { fields: ['requirement_code'] },
            { fields: ['status'] },
            { fields: ['review_state'] },
            { unique: true, fields: ['tenant_id', 'requirement_code'], name: 'tenant_final_review_document_unique' }
        ]
    });

    return TenantComplianceFinalReviewDocument;
};

