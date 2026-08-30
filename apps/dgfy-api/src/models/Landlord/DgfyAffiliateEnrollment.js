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
        },
        // #450 Phase 199 - revocation audit trail; see the migration for the full rationale.
        revoked_at: {
            type: DataTypes.DATE,
            allowNull: true
        },
        revoked_by: {
            type: DataTypes.INTEGER,
            allowNull: true
        },
        revocation_reason: {
            type: DataTypes.STRING(500),
            allowNull: true
        },
        // #449 (Phase 208): per-enrollment cap override. NULL = inherit the tenant default,
        // same convention as commission_rate_bps.
        max_lifetime_earnings_centavos: {
            type: DataTypes.INTEGER,
            allowNull: true
        },
        // #449 (Phase 208): end date belonging to this enrollment's own cap; ignored unless
        // max_lifetime_earnings_centavos is set on this row.
        earnings_cap_active_until: {
            type: DataTypes.DATE,
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
