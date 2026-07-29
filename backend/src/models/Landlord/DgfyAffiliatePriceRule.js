import { DataTypes, Model } from 'sequelize';

// The selling-price rule only (what the buyer pays) - Phase 1 of the affiliate pricing rule engine.
// See docs/proposals/2026-07-29-affiliate-pricing-rule-engine-scope.md and
// backend/migrations/20260729000001-add-affiliate-price-rules.cjs for the sentinel-0 convention on
// enrollment_id (0 = tenant-wide template) and item_id (0 = all products; Phase 2 only).
// Commission configuration is not modeled here - it lives on TenantAffiliateSettings /
// DgfyAffiliateEnrollment as commission_type, alongside the existing commission_rate_bps override.
export default (sequelize) => {
    class DgfyAffiliatePriceRule extends Model { }

    DgfyAffiliatePriceRule.init({
        price_rule_id: {
            type: DataTypes.INTEGER,
            primaryKey: true,
            autoIncrement: true
        },
        tenant_id: {
            type: DataTypes.UUID,
            allowNull: false
        },
        enrollment_id: {
            type: DataTypes.INTEGER,
            allowNull: false,
            defaultValue: 0
        },
        item_id: {
            type: DataTypes.INTEGER,
            allowNull: false,
            defaultValue: 0
        },
        rule_type: {
            type: DataTypes.ENUM(
                'BASE_PRICE',
                'PERCENTAGE_MARKUP',
                'FIXED_MARKUP',
                'PERCENTAGE_DISCOUNT',
                'FIXED_DISCOUNT',
                'EXACT_AFFILIATE_PRICE'
            ),
            allowNull: false,
            defaultValue: 'BASE_PRICE'
        },
        rate_bps: {
            type: DataTypes.INTEGER,
            allowNull: true
        },
        amount_centavos: {
            type: DataTypes.INTEGER,
            allowNull: true
        },
        active: {
            type: DataTypes.BOOLEAN,
            allowNull: false,
            defaultValue: true
        },
        active_from: {
            type: DataTypes.DATE,
            allowNull: true
        },
        active_until: {
            type: DataTypes.DATE,
            allowNull: true
        }
    }, {
        sequelize,
        modelName: 'DgfyAffiliatePriceRule',
        tableName: 'dgfy_affiliate_price_rules',
        underscored: true,
        timestamps: true,
        indexes: [
            { unique: true, fields: ['tenant_id', 'enrollment_id', 'item_id'], name: 'unique_dgfy_affiliate_price_rules_scope' },
            { fields: ['tenant_id', 'active'], name: 'idx_dgfy_affiliate_price_rules_tenant_active' }
        ]
    });

    return DgfyAffiliatePriceRule;
};
