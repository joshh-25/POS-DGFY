
'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
    async up(queryInterface, Sequelize) {
        const tableInfo = await queryInterface.describeTable('tenants').catch(() => ({}));

        // Add columns to tenants table with safety checks
        if (!tableInfo.plan) {
            await queryInterface.addColumn('tenants', 'plan', {
                type: Sequelize.ENUM('standard', 'premium'),
                defaultValue: 'standard',
                after: 'settings'
            });
        }

        if (!tableInfo.subscription_status) {
            await queryInterface.addColumn('tenants', 'subscription_status', {
                type: Sequelize.ENUM('active', 'inactive', 'past_due', 'cancelled', 'pending'),
                defaultValue: 'inactive',
                after: 'plan'
            });
        }

        if (!tableInfo.paypal_subscription_id) {
            await queryInterface.addColumn('tenants', 'paypal_subscription_id', {
                type: Sequelize.STRING,
                allowNull: true,
                after: 'subscription_status'
            });
        }

        if (!tableInfo.current_period_end) {
            await queryInterface.addColumn('tenants', 'current_period_end', {
                type: Sequelize.DATE,
                allowNull: true,
                after: 'paypal_subscription_id'
            });
        }

        if (!tableInfo.trial_ends_at) {
            await queryInterface.addColumn('tenants', 'trial_ends_at', {
                type: Sequelize.DATE,
                allowNull: true,
                after: 'current_period_end'
            });
        }

        // Create payments table with safety check
        const tables = await queryInterface.showAllTables();
        if (!tables.includes('payments')) {
            await queryInterface.createTable('payments', {
                id: {
                    type: Sequelize.UUID,
                    defaultValue: Sequelize.UUIDV4,
                    primaryKey: true
                },
                tenant_id: {
                    type: Sequelize.UUID,
                    allowNull: false,
                    references: {
                        model: 'tenants',
                        key: 'id'
                    },
                    onUpdate: 'CASCADE',
                    onDelete: 'CASCADE'
                },
                transaction_id: {
                    type: Sequelize.STRING,
                    allowNull: false,
                    unique: true
                },
                amount: {
                    type: Sequelize.DECIMAL(10, 2),
                    allowNull: false
                },
                currency: {
                    type: Sequelize.STRING(3),
                    defaultValue: 'USD'
                },
                status: {
                    type: Sequelize.ENUM('completed', 'pending', 'failed', 'refunded'),
                    defaultValue: 'pending'
                },
                payment_method: {
                    type: Sequelize.STRING,
                    defaultValue: 'paypal'
                },
                payment_date: {
                    type: Sequelize.DATE,
                    defaultValue: Sequelize.NOW
                },
                metadata: {
                    type: Sequelize.JSON,
                    defaultValue: {}
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
        }
    },

    async down(queryInterface, Sequelize) {
        // Drop payments table
        await queryInterface.dropTable('payments');

        // Remove columns from tenants table
        await queryInterface.removeColumn('tenants', 'trial_ends_at');
        await queryInterface.removeColumn('tenants', 'current_period_end');
        await queryInterface.removeColumn('tenants', 'paypal_subscription_id');
        await queryInterface.removeColumn('tenants', 'subscription_status');
        await queryInterface.removeColumn('tenants', 'plan');
    }
};
