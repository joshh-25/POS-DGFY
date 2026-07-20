'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
    async up(queryInterface) {
        const tableInfo = await queryInterface.describeTable('tenants').catch(() => ({}));

        if (!tableInfo.billing_cycle_anchor) {
            return;
        }

        await queryInterface.sequelize.transaction(async (transaction) => {
            // Conservative backfill:
            // 1) Never overwrite an existing anchor.
            // 2) Only derive from concrete billing evidence (current_period_end).
            // 3) Scope to premium tenants where the anchor is operationally relevant.
            await queryInterface.sequelize.query(`
                UPDATE tenants
                SET billing_cycle_anchor = DAY(current_period_end)
                WHERE billing_cycle_anchor IS NULL
                  AND plan = 'premium'
                  AND current_period_end IS NOT NULL
            `, { transaction });
        });
    },

    async down() {
        // Irreversible data backfill. Intentionally no-op.
    }
};

