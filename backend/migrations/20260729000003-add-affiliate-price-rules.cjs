'use strict';

// Phase 1 of the affiliate pricing rule engine - see
// docs/proposals/2026-07-29-affiliate-pricing-rule-engine-scope.md. All additive: existing affiliate
// behavior (ADR 0036) is unchanged for any tenant/enrollment that never configures a price rule.
//
// New dgfy_affiliate_price_rules holds ONLY the selling-price rule (what the buyer pays) - the six
// modes from backend/src/modules/shared/utils/affiliatePricingPolicy.js. Commission configuration
// is not a new rule table: it extends the existing commission_rate_bps column with a sibling
// commission_type flag directly on tenant_affiliate_settings / dgfy_affiliate_enrollments, following
// the same override-falls-back-to-tenant-default pattern already established for the rate itself.
//
// MySQL gotcha (recorded in the scope doc's rule-resolution section): MySQL treats NULL as distinct
// in a unique index, so `enrollment_id IS NULL` cannot express "the template row" under
// UNIQUE (tenant_id, enrollment_id, item_id). Sentinel 0 is used instead for both enrollment_id
// (0 = tenant-wide template) and item_id (0 = applies to all products; Phase 2 populates real
// tenant-DB item ids here, held by value only - no cross-database FK, same convention as
// order_reference elsewhere in this module).
//
// Idempotent throughout via describeTable/showIndex guards, mirroring
// 20260723000001-create-affiliates-program.cjs, so a re-run against an already-migrated database
// is a no-op.

const addIndexIfMissing = async (queryInterface, tableName, fields, options) => {
    const indexes = await queryInterface.showIndex(tableName).catch(() => []);
    if (indexes.some((index) => index.name === options.name)) return;
    await queryInterface.addIndex(tableName, fields, options);
};

const addColumnIfMissing = async (queryInterface, tableName, columnName, spec) => {
    const tableInfo = await queryInterface.describeTable(tableName);
    if (!tableInfo[columnName]) {
        await queryInterface.addColumn(tableName, columnName, spec);
    }
};

module.exports = {
    async up(queryInterface, Sequelize) {
        // 1. dgfy_affiliate_price_rules - the selling-price rule only
        const priceRulesTable = await queryInterface.describeTable('dgfy_affiliate_price_rules').catch(() => null);
        if (!priceRulesTable) {
            await queryInterface.createTable('dgfy_affiliate_price_rules', {
                price_rule_id: {
                    type: Sequelize.INTEGER,
                    primaryKey: true,
                    autoIncrement: true,
                    allowNull: false
                },
                tenant_id: {
                    type: Sequelize.UUID,
                    allowNull: false
                },
                // 0 = tenant-wide template row (applies to every affiliate with no per-enrollment
                // override). A real enrollment_id scopes the rule to that one affiliate.
                enrollment_id: {
                    type: Sequelize.INTEGER,
                    allowNull: false,
                    defaultValue: 0
                },
                // 0 = applies to all products. Phase 2 populates real tenant-DB item ids here (value
                // link only, no cross-database FK - same convention as order_reference). Phase 1
                // only ever writes 0.
                item_id: {
                    type: Sequelize.INTEGER,
                    allowNull: false,
                    defaultValue: 0
                },
                rule_type: {
                    type: Sequelize.ENUM(
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
                // Used by PERCENTAGE_MARKUP / PERCENTAGE_DISCOUNT only. Basis points, not a percent.
                rate_bps: {
                    type: Sequelize.INTEGER,
                    allowNull: true
                },
                // Used by FIXED_MARKUP / FIXED_DISCOUNT / EXACT_AFFILIATE_PRICE only. Integer
                // centavos, never DECIMAL (ADR 0036 Decision 2).
                amount_centavos: {
                    type: Sequelize.INTEGER,
                    allowNull: true
                },
                active: {
                    type: Sequelize.BOOLEAN,
                    allowNull: false,
                    defaultValue: true
                },
                // Reserved for Phase 2 (effective-date windows). Always NULL in Phase 1 - a rule is
                // either active or it isn't, with no scheduling.
                active_from: {
                    type: Sequelize.DATE,
                    allowNull: true
                },
                active_until: {
                    type: Sequelize.DATE,
                    allowNull: true
                },
                created_at: {
                    type: Sequelize.DATE,
                    allowNull: false,
                    defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
                },
                updated_at: {
                    type: Sequelize.DATE,
                    allowNull: false,
                    defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
                }
            });
        }
        await addIndexIfMissing(queryInterface, 'dgfy_affiliate_price_rules', ['tenant_id', 'enrollment_id', 'item_id'], {
            name: 'unique_dgfy_affiliate_price_rules_scope',
            unique: true
        });
        await addIndexIfMissing(queryInterface, 'dgfy_affiliate_price_rules', ['tenant_id', 'active'], {
            name: 'idx_dgfy_affiliate_price_rules_tenant_active'
        });

        // 2. tenant_affiliate_settings += commission_type, settlement_policy, commission_base_mode
        // commission_type defaults to PERCENTAGE_OF_BASE - every affiliate today implicitly earns a
        // percentage-of-base commission via commission_rate_bps, so this default preserves current
        // behavior for every existing tenant with no code change required on their part.
        await addColumnIfMissing(queryInterface, 'tenant_affiliate_settings', 'commission_type', {
            type: Sequelize.ENUM('NONE', 'PERCENTAGE_OF_BASE', 'RESELLER_MARGIN'),
            allowNull: false,
            defaultValue: 'PERCENTAGE_OF_BASE'
        });
        // NULL means no affiliate pricing rule is configured yet, so which policy would apply is
        // moot. Once an owner configures a price rule this is set explicitly (decision A8, three
        // values - CUSTOM_OR_UNRESOLVED from the external pack is intentionally not one of them).
        await addColumnIfMissing(queryInterface, 'tenant_affiliate_settings', 'settlement_policy', {
            type: Sequelize.ENUM('MERCHANT_FUNDED', 'COMMISSION_ADDED_TO_BUYER_PRICE', 'RESELLER_MARGIN'),
            allowNull: true
        });
        // Decision A3, gated behind this flag rather than shipped unconditionally: existing
        // affiliates keep accruing on subtotal-minus-discount (today's ADR 0036 Decision 3 base)
        // until an owner explicitly opts a tenant into commission-on-base-price-subtotal.
        await addColumnIfMissing(queryInterface, 'tenant_affiliate_settings', 'commission_base_mode', {
            type: Sequelize.ENUM('discounted_subtotal', 'base_price_subtotal'),
            allowNull: false,
            defaultValue: 'discounted_subtotal'
        });

        // 3. dgfy_affiliate_enrollments += commission_type (nullable override, same fallback
        // pattern as the existing commission_rate_bps override: NULL means "inherit the tenant's
        // commission_type").
        await addColumnIfMissing(queryInterface, 'dgfy_affiliate_enrollments', 'commission_type', {
            type: Sequelize.ENUM('NONE', 'PERCENTAGE_OF_BASE', 'RESELLER_MARGIN'),
            allowNull: true
        });

        // 4. dgfy_affiliate_commissions += snapshot columns. All nullable: pre-existing rows and any
        // future row accrued with no affiliate price rule attached are unaffected and simply leave
        // these NULL.
        await addColumnIfMissing(queryInterface, 'dgfy_affiliate_commissions', 'base_subtotal_centavos', {
            type: Sequelize.INTEGER,
            allowNull: true,
            comment: 'The base-price (pre-affiliate-rule) subtotal for this order, in centavos. Populated only when an affiliate price rule was applied.'
        });
        await addColumnIfMissing(queryInterface, 'dgfy_affiliate_commissions', 'buyer_subtotal_centavos', {
            type: Sequelize.INTEGER,
            allowNull: true,
            comment: 'What the buyer actually paid (post affiliate price rule), in centavos - distinct from commissionable_base_centavos, which is what the commission was computed from.'
        });
        await addColumnIfMissing(queryInterface, 'dgfy_affiliate_commissions', 'reseller_margin_centavos', {
            type: Sequelize.INTEGER,
            allowNull: true,
            comment: 'Populated only when commission_type is RESELLER_MARGIN on this row - the buyer_subtotal minus base_subtotal the affiliate keeps.'
        });
        await addColumnIfMissing(queryInterface, 'dgfy_affiliate_commissions', 'price_rule_type_snapshot', {
            type: Sequelize.STRING(32),
            allowNull: true,
            comment: 'Which selling-price rule type (see dgfy_affiliate_price_rules.rule_type) was applied to this order, frozen at accrual time.'
        });
        await addColumnIfMissing(queryInterface, 'dgfy_affiliate_commissions', 'settlement_policy_snapshot', {
            type: Sequelize.STRING(32),
            allowNull: true,
            comment: 'Which settlement policy applied to this order, frozen at accrual time so a later settings change never rewrites historical ledger rows (mirrors the existing rate_bps_snapshot convention).'
        });
    },

    async down(queryInterface) {
        await queryInterface.removeColumn('dgfy_affiliate_commissions', 'settlement_policy_snapshot').catch(() => null);
        await queryInterface.removeColumn('dgfy_affiliate_commissions', 'price_rule_type_snapshot').catch(() => null);
        await queryInterface.removeColumn('dgfy_affiliate_commissions', 'reseller_margin_centavos').catch(() => null);
        await queryInterface.removeColumn('dgfy_affiliate_commissions', 'buyer_subtotal_centavos').catch(() => null);
        await queryInterface.removeColumn('dgfy_affiliate_commissions', 'base_subtotal_centavos').catch(() => null);

        await queryInterface.removeColumn('dgfy_affiliate_enrollments', 'commission_type').catch(() => null);

        await queryInterface.removeColumn('tenant_affiliate_settings', 'commission_base_mode').catch(() => null);
        await queryInterface.removeColumn('tenant_affiliate_settings', 'settlement_policy').catch(() => null);
        await queryInterface.removeColumn('tenant_affiliate_settings', 'commission_type').catch(() => null);

        await queryInterface.removeIndex('dgfy_affiliate_price_rules', 'idx_dgfy_affiliate_price_rules_tenant_active').catch(() => null);
        await queryInterface.removeIndex('dgfy_affiliate_price_rules', 'unique_dgfy_affiliate_price_rules_scope').catch(() => null);
        await queryInterface.dropTable('dgfy_affiliate_price_rules').catch(() => null);
    }
};
