/** @type {import('sequelize-cli').Migration} */
module.exports = {
    async up(queryInterface, Sequelize) {
        const tableInfo = await queryInterface.describeTable('tenants').catch(() => ({}));

        // Add PayMongo subscription fields
        if (!tableInfo.paymongo_subscription_id) {
            await queryInterface.addColumn('tenants', 'paymongo_subscription_id', {
                type: Sequelize.STRING,
                allowNull: true
            });
        }

        if (!tableInfo.pending_paymongo_subscription_id) {
            await queryInterface.addColumn('tenants', 'pending_paymongo_subscription_id', {
                type: Sequelize.STRING,
                allowNull: true
            });
        }

        if (!tableInfo.paymongo_setup_initiated_at) {
            await queryInterface.addColumn('tenants', 'paymongo_setup_initiated_at', {
                type: Sequelize.DATE,
                allowNull: true
            });
        }

        if (!tableInfo.paymongo_source_id) {
            await queryInterface.addColumn('tenants', 'paymongo_source_id', {
                type: Sequelize.STRING,
                allowNull: true
            });
        }

        // Update payment_method ENUM to include 'paymongo'
        try {
            await queryInterface.changeColumn('tenants', 'payment_method', {
                type: Sequelize.ENUM('manual', 'paypal', 'paymongo'),
                defaultValue: 'manual',
                allowNull: false
            });
        } catch (error) {
            // If direct ENUM update fails (MySQL limitation), use raw query
            await queryInterface.sequelize.query(
                "ALTER TABLE tenants MODIFY payment_method ENUM('manual', 'paypal', 'paymongo') DEFAULT 'manual' NOT NULL"
            );
        }
    },

    async down(queryInterface, Sequelize) {
        // Remove PayMongo fields
        if ((await queryInterface.describeTable('tenants')).paymongo_subscription_id) {
            await queryInterface.removeColumn('tenants', 'paymongo_subscription_id');
        }

        if ((await queryInterface.describeTable('tenants')).pending_paymongo_subscription_id) {
            await queryInterface.removeColumn('tenants', 'pending_paymongo_subscription_id');
        }

        if ((await queryInterface.describeTable('tenants')).paymongo_setup_initiated_at) {
            await queryInterface.removeColumn('tenants', 'paymongo_setup_initiated_at');
        }

        if ((await queryInterface.describeTable('tenants')).paymongo_source_id) {
            await queryInterface.removeColumn('tenants', 'paymongo_source_id');
        }

        // Revert payment_method ENUM
        try {
            await queryInterface.changeColumn('tenants', 'payment_method', {
                type: Sequelize.ENUM('manual', 'paypal'),
                defaultValue: 'manual',
                allowNull: false
            });
        } catch (error) {
            await queryInterface.sequelize.query(
                "ALTER TABLE tenants MODIFY payment_method ENUM('manual', 'paypal') DEFAULT 'manual' NOT NULL"
            );
        }
    }
};
