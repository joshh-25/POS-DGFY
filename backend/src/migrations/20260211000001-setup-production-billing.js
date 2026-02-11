
/** @type {import('sequelize-cli').Migration} */
module.exports = {
    async up(queryInterface, Sequelize) {
        // 1. Add columns to 'tenants' table
        await queryInterface.addColumn('tenants', 'subscription_status', {
            type: Sequelize.ENUM('active', 'inactive', 'past_due', 'cancelled', 'pending'),
            defaultValue: 'active',
            allowNull: false
        });

        await queryInterface.addColumn('tenants', 'grace_period_end', {
            type: Sequelize.DATE,
            allowNull: true
        });

        await queryInterface.addColumn('tenants', 'cancelled_at', {
            type: Sequelize.DATE,
            allowNull: true
        });

        // 2. Create 'webhook_logs' table
        await queryInterface.createTable('webhook_logs', {
            id: {
                allowNull: false,
                autoIncrement: true,
                primaryKey: true,
                type: Sequelize.INTEGER
            },
            webhook_id: {
                type: Sequelize.STRING,
                allowNull: false,
                unique: true
            },
            event_type: {
                type: Sequelize.STRING,
                allowNull: true
            },
            status: {
                type: Sequelize.STRING,
                defaultValue: 'received'
            },
            error_message: {
                type: Sequelize.TEXT,
                allowNull: true
            },
            created_at: {
                allowNull: false,
                type: Sequelize.DATE
            },
            updated_at: {
                allowNull: false,
                type: Sequelize.DATE
            }
        });

        // Add index for idempotency checks
        await queryInterface.addIndex('webhook_logs', ['webhook_id']);
    },

    async down(queryInterface, Sequelize) {
        // 1. Drop webhook_logs table
        await queryInterface.dropTable('webhook_logs');

        // 2. Remove columns from tenants
        await queryInterface.removeColumn('tenants', 'subscription_status');
        await queryInterface.removeColumn('tenants', 'grace_period_end');
        await queryInterface.removeColumn('tenants', 'cancelled_at');

        // Note: Dropping the ENUM type itself is dialect-specific and often unnecessary for a rollback
    }
};
