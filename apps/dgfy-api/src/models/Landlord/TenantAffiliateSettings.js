import { DataTypes, Model } from 'sequelize';

export default (sequelize) => {
    class TenantAffiliateSettings extends Model { }

    TenantAffiliateSettings.init({
        tenant_id: {
            type: DataTypes.UUID,
            primaryKey: true
        },
        program_enabled: {
            type: DataTypes.BOOLEAN,
            allowNull: false,
            defaultValue: false
        },
        // System default: 5% (500 basis points).
        default_rate_bps: {
            type: DataTypes.INTEGER,
            allowNull: false,
            defaultValue: 500
        },
        attribution_window_days: {
            type: DataTypes.INTEGER,
            allowNull: false,
            defaultValue: 60
        },
        // Default PHP 200.00.
        min_cashout_centavos: {
            type: DataTypes.INTEGER,
            allowNull: false,
            defaultValue: 20000
        },
        auto_approve_enrollment: {
            type: DataTypes.BOOLEAN,
            allowNull: false,
            defaultValue: false
        },
        // #1177 (Phase 198, per #447 D1-D6): the code-enforced cap on concurrently-consumed
        // affiliate slots for this tenant (active enrollments + pending, non-expired invites).
        // Raised only by internal admin action - no self-serve purchase path (#447 D5).
        max_affiliate_slots: {
            type: DataTypes.INTEGER,
            allowNull: false,
            defaultValue: 1
        },
        // Defaults to PERCENTAGE_OF_BASE - every affiliate today implicitly earns a
        // percentage-of-base commission via commission_rate_bps, so this preserves current
        // behavior for every existing tenant.
        commission_type: {
            type: DataTypes.ENUM('NONE', 'PERCENTAGE_OF_BASE', 'RESELLER_MARGIN'),
            allowNull: false,
            defaultValue: 'PERCENTAGE_OF_BASE'
        },
        // NULL until an owner configures an affiliate price rule - which policy would apply is moot
        // before that. Decision A8: three values, CUSTOM_OR_UNRESOLVED from the external spec pack
        // is intentionally not one of them.
        settlement_policy: {
            type: DataTypes.ENUM('MERCHANT_FUNDED', 'COMMISSION_ADDED_TO_BUYER_PRICE', 'RESELLER_MARGIN'),
            allowNull: true
        },
        // Decision A3, gated behind this flag: existing affiliates keep accruing on
        // subtotal-minus-discount (today's ADR 0036 Decision 3 base) until an owner explicitly
        // opts a tenant into commission-on-base-price-subtotal.
        commission_base_mode: {
            type: DataTypes.ENUM('discounted_subtotal', 'base_price_subtotal'),
            allowNull: false,
            defaultValue: 'discounted_subtotal'
        }
    }, {
        sequelize,
        modelName: 'TenantAffiliateSettings',
        tableName: 'tenant_affiliate_settings',
        underscored: true,
        timestamps: true
    });

    return TenantAffiliateSettings;
};
