'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
    async up(queryInterface, Sequelize) {
        await queryInterface.createTable('ai_usage_logs', {
            id: {
                type: Sequelize.UUID,
                defaultValue: Sequelize.UUIDV4,
                primaryKey: true
            },
            tenant_id: {
                type: Sequelize.UUID,
                allowNull: false
            },
            user_id: {
                type: Sequelize.UUID,
                allowNull: false
            },
            model: {
                type: Sequelize.STRING,
                allowNull: false
            },
            input_tokens: {
                type: Sequelize.INTEGER,
                allowNull: false,
                defaultValue: 0
            },
            output_tokens: {
                type: Sequelize.INTEGER,
                allowNull: false,
                defaultValue: 0
            },
            cost_usd: {
                type: Sequelize.DECIMAL(10, 6),
                allowNull: false,
                defaultValue: 0
            },
            timestamp: {
                type: Sequelize.DATE,
                allowNull: false,
                defaultValue: Sequelize.NOW
            },
            created_at: {
                allowNull: false,
                type: Sequelize.DATE
            }
        });

        // Add indices for reporting performance
        await queryInterface.addIndex('ai_usage_logs', ['tenant_id']);
        await queryInterface.addIndex('ai_usage_logs', ['user_id']);
        await queryInterface.addIndex('ai_usage_logs', ['timestamp']);
    },

    async down(queryInterface, Sequelize) {
        await queryInterface.dropTable('ai_usage_logs');
    }
};
