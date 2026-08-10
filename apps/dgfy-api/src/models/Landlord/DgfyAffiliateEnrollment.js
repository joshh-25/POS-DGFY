import { DataTypes, Model } from 'sequelize';

export default (sequelize) => {
    class DgfyAffiliateEnrollment extends Model { }

    DgfyAffiliateEnrollment.init({
        enrollment_id: {
            type: DataTypes.INTEGER,
            primaryKey: true,
            autoIncrement: true
        },
        dgfy_account_id: {
            type: DataTypes.UUID,
            allowNull: false
        },
        tenant_id: {
            type: DataTypes.UUID,
            allowNull: false
        },
        share_code_hash: {
            type: DataTypes.STRING(128),
            allowNull: false
        },
        short_code: {
            type: DataTypes.STRING(16),
            allowNull: false
        },
        commission_rate_bps: {
            type: DataTypes.INTEGER,
            allowNull: true
        },
        status: {
            type: DataTypes.ENUM('pending', 'active', 'suspended', 'revoked'),
            allowNull: false,
            defaultValue: 'pending'
        },
        source: {
            type: DataTypes.ENUM('invite', 'self_serve', 'admin_provisioned'),
            allowNull: false,
            defaultValue: 'admin_provisioned'
        },
        invited_email: {
            type: DataTypes.STRING(255),
            allowNull: true
        },
        activated_at: {
            type: DataTypes.DATE,
            allowNull: true
        },
        // Nullable override, same fallback pattern as commission_rate_bps: NULL means "inherit the
        // tenant's commission_type" (TenantAffiliateSettings). Phase 1 affiliate pricing rule engine.
        commission_type: {
            type: DataTypes.ENUM('NONE', 'PERCENTAGE_OF_BASE', 'RESELLER_MARGIN'),
            allowNull: true
        }
    }, {
        sequelize,
        modelName: 'DgfyAffiliateEnrollment',
        tableName: 'dgfy_affiliate_enrollments',
        underscored: true,
        timestamps: true,
        indexes: [
            { unique: true, fields: ['dgfy_account_id', 'tenant_id'], name: 'unique_dgfy_affiliate_enrollments_account_tenant' },
            { unique: true, fields: ['share_code_hash'], name: 'unique_dgfy_affiliate_enrollments_share_code_hash' },
            { unique: true, fields: ['short_code'], name: 'unique_dgfy_affiliate_enrollments_short_code' },
            { fields: ['tenant_id', 'status'], name: 'idx_dgfy_affiliate_enrollments_tenant_status' }
        ]
    });

    return DgfyAffiliateEnrollment;
};
