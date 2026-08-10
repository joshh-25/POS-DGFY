import { DataTypes, Model } from 'sequelize';

export default (sequelize) => {
    class TenantComplianceFinalReviewSignoff extends Model { }

    TenantComplianceFinalReviewSignoff.init({
        tenant_compliance_final_review_signoff_id: {
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
        engineering_approver: {
            type: DataTypes.STRING(255),
            allowNull: true
        },
        compliance_approver: {
            type: DataTypes.STRING(255),
            allowNull: true
        },
        filing_batch_id: {
            type: DataTypes.STRING(120),
            allowNull: true
        },
        engineering_signed_at: {
            type: DataTypes.DATE,
            allowNull: true
        },
        compliance_signed_at: {
            type: DataTypes.DATE,
            allowNull: true
        }
    }, {
        sequelize,
        modelName: 'TenantComplianceFinalReviewSignoff',
        tableName: 'tenant_compliance_final_review_signoffs',
        underscored: true,
        timestamps: true,
        indexes: [
            { fields: ['tenant_id'], unique: true, name: 'tenant_final_review_signoff_tenant_unique' }
        ]
    });

    return TenantComplianceFinalReviewSignoff;
};

