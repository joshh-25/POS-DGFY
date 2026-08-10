'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
    async up(queryInterface, Sequelize) {
        await queryInterface.addColumn('engagement_events', 'event_category', {
            type: Sequelize.STRING(100),
            allowNull: true
        });
        await queryInterface.addColumn('engagement_events', 'event_version', {
            type: Sequelize.INTEGER,
            allowNull: false,
            defaultValue: 1
        });
        await queryInterface.addColumn('engagement_events', 'request_id', {
            type: Sequelize.STRING(255),
            allowNull: true
        });
        await queryInterface.addColumn('engagement_events', 'trace_id', {
            type: Sequelize.STRING(255),
            allowNull: true
        });
        await queryInterface.addColumn('engagement_events', 'outcome', {
            type: Sequelize.STRING(50),
            allowNull: true
        });
        await queryInterface.addColumn('engagement_events', 'failure_code', {
            type: Sequelize.STRING(100),
            allowNull: true
        });
        await queryInterface.addColumn('engagement_events', 'failure_reason', {
            type: Sequelize.TEXT,
            allowNull: true
        });
        await queryInterface.addColumn('engagement_events', 'provider_event_id', {
            type: Sequelize.STRING(255),
            allowNull: true
        });
        await queryInterface.addColumn('engagement_events', 'provider_event_time', {
            type: Sequelize.DATE,
            allowNull: true
        });
        await queryInterface.addColumn('engagement_events', 'ingested_at', {
            type: Sequelize.DATE,
            allowNull: false,
            defaultValue: Sequelize.NOW
        });
        await queryInterface.addColumn('engagement_events', 'processed_at', {
            type: Sequelize.DATE,
            allowNull: true
        });
        await queryInterface.addColumn('engagement_events', 'environment', {
            type: Sequelize.STRING(50),
            allowNull: true
        });
        await queryInterface.addColumn('engagement_events', 'surface', {
            type: Sequelize.STRING(255),
            allowNull: true
        });
        await queryInterface.addColumn('engagement_events', 'platform', {
            type: Sequelize.STRING(50),
            allowNull: true
        });
        await queryInterface.addColumn('engagement_events', 'actor_type', {
            type: Sequelize.STRING(50),
            allowNull: true
        });
        await queryInterface.addColumn('engagement_events', 'is_internal_actor', {
            type: Sequelize.BOOLEAN,
            allowNull: true
        });
        await queryInterface.addColumn('engagement_events', 'is_bot_suspected', {
            type: Sequelize.BOOLEAN,
            allowNull: true
        });
        await queryInterface.addColumn('engagement_events', 'session_id', {
            type: Sequelize.STRING(255),
            allowNull: true
        });
        await queryInterface.addColumn('engagement_events', 'experiment_key', {
            type: Sequelize.STRING(255),
            allowNull: true
        });
        await queryInterface.addColumn('engagement_events', 'variant_key', {
            type: Sequelize.STRING(255),
            allowNull: true
        });
        await queryInterface.addColumn('engagement_events', 'exposure_id', {
            type: Sequelize.STRING(255),
            allowNull: true
        });

        await queryInterface.addIndex('engagement_events', ['correlation_id'], { name: 'idx_engagement_correlation_id' });
        await queryInterface.addIndex('engagement_events', ['request_id'], { name: 'idx_engagement_request_id' });
        await queryInterface.addIndex('engagement_events', ['provider_event_id'], { name: 'idx_engagement_provider_event_id' });
        await queryInterface.addIndex('engagement_events', ['event_type', 'event_time'], { name: 'idx_engagement_event_type_time' });
        await queryInterface.addIndex('engagement_events', ['tenant_id', 'event_time'], { name: 'idx_engagement_tenant_time' });
        await queryInterface.addIndex('engagement_events', ['subscription_id', 'event_time'], { name: 'idx_engagement_subscription_time' });
    },

    async down(queryInterface) {
        await queryInterface.removeIndex('engagement_events', 'idx_engagement_subscription_time');
        await queryInterface.removeIndex('engagement_events', 'idx_engagement_tenant_time');
        await queryInterface.removeIndex('engagement_events', 'idx_engagement_event_type_time');
        await queryInterface.removeIndex('engagement_events', 'idx_engagement_provider_event_id');
        await queryInterface.removeIndex('engagement_events', 'idx_engagement_request_id');
        await queryInterface.removeIndex('engagement_events', 'idx_engagement_correlation_id');

        await queryInterface.removeColumn('engagement_events', 'exposure_id');
        await queryInterface.removeColumn('engagement_events', 'variant_key');
        await queryInterface.removeColumn('engagement_events', 'experiment_key');
        await queryInterface.removeColumn('engagement_events', 'session_id');
        await queryInterface.removeColumn('engagement_events', 'is_bot_suspected');
        await queryInterface.removeColumn('engagement_events', 'is_internal_actor');
        await queryInterface.removeColumn('engagement_events', 'actor_type');
        await queryInterface.removeColumn('engagement_events', 'platform');
        await queryInterface.removeColumn('engagement_events', 'surface');
        await queryInterface.removeColumn('engagement_events', 'environment');
        await queryInterface.removeColumn('engagement_events', 'processed_at');
        await queryInterface.removeColumn('engagement_events', 'ingested_at');
        await queryInterface.removeColumn('engagement_events', 'provider_event_time');
        await queryInterface.removeColumn('engagement_events', 'provider_event_id');
        await queryInterface.removeColumn('engagement_events', 'failure_reason');
        await queryInterface.removeColumn('engagement_events', 'failure_code');
        await queryInterface.removeColumn('engagement_events', 'outcome');
        await queryInterface.removeColumn('engagement_events', 'trace_id');
        await queryInterface.removeColumn('engagement_events', 'request_id');
        await queryInterface.removeColumn('engagement_events', 'event_version');
        await queryInterface.removeColumn('engagement_events', 'event_category');
    }
};
