
/** @type {import('sequelize-cli').Migration} */
module.exports = {
    async up(queryInterface, Sequelize) {
        const tableInfo = await queryInterface.describeTable('tenants').catch(() => ({}));

        if (!tableInfo.pending_plan) {
            await queryInterface.addColumn('tenants', 'pending_plan', {
                type: Sequelize.ENUM('standard', 'premium'),
                allowNull: true
            });
        }

        if (!tableInfo.pending_plan_change_date) {
            await queryInterface.addColumn('tenants', 'pending_plan_change_date', {
                type: Sequelize.DATE,
                allowNull: true
            });
        }

        if (!tableInfo.pending_plan_approved) {
            await queryInterface.addColumn('tenants', 'pending_plan_approved', {
                type: Sequelize.BOOLEAN,
                defaultValue: false
            });
        }

        if (!tableInfo.pending_paypal_subscription_id) {
            await queryInterface.addColumn('tenants', 'pending_paypal_subscription_id', {
                type: Sequelize.STRING,
                allowNull: true
            });
        }

        if (!tableInfo.paypal_setup_initiated_at) {
            await queryInterface.addColumn('tenants', 'paypal_setup_initiated_at', {
                type: Sequelize.DATE,
                allowNull: true
            });
        }

        if (!tableInfo.payment_method) {
            await queryInterface.addColumn('tenants', 'payment_method', {
                type: Sequelize.ENUM('manual', 'paypal'),
                defaultValue: 'manual'
            });
        }

        if (!tableInfo.reactivation_requested_at) {
            await queryInterface.addColumn('tenants', 'reactivation_requested_at', {
                type: Sequelize.DATE,
                allowNull: true
            });
        }

        if (!tableInfo.rejection_reason) {
            await queryInterface.addColumn('tenants', 'rejection_reason', {
                type: Sequelize.STRING(500),
                allowNull: true
            });
        }
    },

    async down(queryInterface, Sequelize) {
        await queryInterface.removeColumn('tenants', 'pending_plan');
        await queryInterface.removeColumn('tenants', 'pending_plan_change_date');
        await queryInterface.removeColumn('tenants', 'pending_plan_approved');
        await queryInterface.removeColumn('tenants', 'pending_paypal_subscription_id');
        await queryInterface.removeColumn('tenants', 'paypal_setup_initiated_at');
        await queryInterface.removeColumn('tenants', 'payment_method');
        await queryInterface.removeColumn('tenants', 'reactivation_requested_at');
        await queryInterface.removeColumn('tenants', 'rejection_reason');
    }
};
