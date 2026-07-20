'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
    async up(queryInterface) {
        const tableInfo = await queryInterface.describeTable('tenants').catch(() => ({}));
        if (!tableInfo.plan || !tableInfo.status) return;

        await queryInterface.sequelize.query(`
            UPDATE tenants
            SET plan = 'premium'
            WHERE status IN ('pending', 'active')
              AND (plan IS NULL OR plan <> 'premium')
        `);
    },

    async down() {
        // Intentionally no-op. Tenant plan changes may grant access during the
        // rollout and cannot be safely inferred back to a prior billing intent.
    }
};
