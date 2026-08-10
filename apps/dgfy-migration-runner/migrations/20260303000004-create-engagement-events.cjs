'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
    async up(queryInterface, Sequelize) {
        await queryInterface.createTable('engagement_events', {
            id: {
                type: Sequelize.UUID,
                defaultValue: Sequelize.UUIDV4,
                primaryKey: true
            },
            event_type: {
                type: Sequelize.STRING(100),
                allowNull: false
            },
            tenant_id: {
                type: Sequelize.UUID,
                allowNull: true,
                references: {
                    model: 'tenants',
                    key: 'id'
                },
                onUpdate: 'CASCADE',
                onDelete: 'SET NULL'
            },
            user_id: {
                type: Sequelize.INTEGER,
                allowNull: true
            },
            source: {
                type: Sequelize.STRING(50),
                allowNull: false,
                defaultValue: 'backend'
            },
            subscription_id: {
                type: Sequelize.STRING(255),
                allowNull: true
            },
            correlation_id: {
                type: Sequelize.STRING(255),
                allowNull: true
            },
            idempotency_key: {
                type: Sequelize.STRING(255),
                allowNull: true,
                unique: true
            },
            metadata: {
                type: Sequelize.JSON,
                allowNull: false,
                defaultValue: {}
            },
            event_time: {
                type: Sequelize.DATE,
                allowNull: false,
                defaultValue: Sequelize.NOW
            },
            created_at: {
                allowNull: false,
                type: Sequelize.DATE
            }
        });

        await queryInterface.addIndex('engagement_events', ['event_type'], { name: 'idx_engagement_event_type' });
        await queryInterface.addIndex('engagement_events', ['tenant_id'], { name: 'idx_engagement_tenant_id' });
        await queryInterface.addIndex('engagement_events', ['subscription_id'], { name: 'idx_engagement_subscription_id' });
        await queryInterface.addIndex('engagement_events', ['event_time'], { name: 'idx_engagement_event_time' });
    },

    async down(queryInterface, Sequelize) {
        await queryInterface.dropTable('engagement_events');
    }
};
