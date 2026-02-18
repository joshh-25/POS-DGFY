
'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
    async up(queryInterface, Sequelize) {
        const tableInfo = await queryInterface.describeTable('tenants').catch(() => ({}));

        if (!tableInfo.billing_cycle_anchor) {
            await queryInterface.addColumn('tenants', 'billing_cycle_anchor', {
                type: Sequelize.INTEGER,
                allowNull: true,
                after: 'plan',
                comment: 'Day of month for billing (1-31)'
            });

            // Populate existing tenants based on current_period_end or created_at
            // Best effort to set an anchor for existing users.
            await queryInterface.sequelize.query(`
                UPDATE tenants 
                SET billing_cycle_anchor = DAY(COALESCE(current_period_end, created_at, NOW()))
                WHERE billing_cycle_anchor IS NULL
            `);
        }
    },

    async down(queryInterface, Sequelize) {
        await queryInterface.removeColumn('tenants', 'billing_cycle_anchor');
    }
};
