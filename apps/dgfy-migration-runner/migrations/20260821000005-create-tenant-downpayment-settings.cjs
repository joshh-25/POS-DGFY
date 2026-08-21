'use strict';

// Phase 138 (#820) -- ADR 0069 clause 5 ([default], config-surface steer): a typed per-tenant
// settings table, modeled on tenant_affiliate_settings (20260723000001-create-affiliates-program.cjs)
// -- same landlord-DB, one-row-per-tenant shape, same idempotency guards. Money-shaped columns use
// INTEGER centavos, matching that table's own convention (min_cashout_centavos etc.), not the
// tenant-DB pos_transaction_* DECIMAL(14,4) peso convention Phase 137 used -- these are two
// different databases with two different existing conventions, and this table follows its own
// landlord-DB sibling, not Phase 137's tenant-DB table.
//
// payment_mode's 'customer_choice' literal is authorized by ADR 0069 clause 5's "exact schema is
// left to implementation" latitude and #820's own scope text ("Schema customer_choice now; server
// rejects it as unsupported in v1 so it can't ship half-built") -- the ENUM includes it so a future
// phase that actually builds it needs no further migration; apps/dgfy-api/.../downpaymentSettingsUseCases.js
// is what actually rejects an attempt to set it, not this schema.

const timestampColumns = (Sequelize) => ({
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

const TABLE = 'tenant_downpayment_settings';

module.exports = {
    async up(queryInterface, Sequelize) {
        const existing = await queryInterface.describeTable(TABLE).catch(() => null);
        if (existing) return;

        await queryInterface.createTable(TABLE, {
            tenant_id: {
                type: Sequelize.UUID,
                primaryKey: true,
                allowNull: false
            },
            payment_mode: {
                type: Sequelize.ENUM('full_payment', 'downpayment_required', 'customer_choice'),
                allowNull: false,
                defaultValue: 'full_payment'
            },
            downpayment_type: {
                type: Sequelize.ENUM('percentage', 'fixed'),
                allowNull: true
            },
            downpayment_rate_bps: {
                type: Sequelize.INTEGER,
                allowNull: true
            },
            downpayment_fixed_centavos: {
                type: Sequelize.INTEGER,
                allowNull: true
            },
            // ADR clause 5 / #820: "required -- feeds Phase 140's fee guard". NOT NULL DEFAULT 0 at
            // the DB layer (every row always has a value); the functional "must be > 0 when
            // payment_mode = downpayment_required" rule is enforced at the Joi/use-case layer, which
            // a DB default alone cannot express.
            min_downpayment_centavos: {
                type: Sequelize.INTEGER,
                allowNull: false,
                defaultValue: 0
            },
            downpayment_refundable: {
                type: Sequelize.BOOLEAN,
                allowNull: false,
                defaultValue: true
            },
            // NULL = inherit the business-wide capture-method allow-list from #816 (not yet built).
            allowed_capture_methods: {
                type: Sequelize.JSON,
                allowNull: true
            },
            ...timestampColumns(Sequelize)
        });
    },

    async down(queryInterface) {
        await queryInterface.dropTable(TABLE).catch(() => null);
    }
};
