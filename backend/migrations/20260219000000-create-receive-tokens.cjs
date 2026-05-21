'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
    async up(queryInterface, Sequelize) {
        await queryInterface.createTable('receive_tokens', {
            token_id: {
                type: Sequelize.INTEGER,
                primaryKey: true,
                autoIncrement: true
            },
            token_hash: {
                type: Sequelize.STRING(64),
                allowNull: false,
                unique: true
            },
            token_type: {
                type: Sequelize.ENUM('PO', 'JO'),
                allowNull: false
            },
            order_id: {
                type: Sequelize.INTEGER,
                allowNull: false
            },
            expires_at: {
                type: Sequelize.DATE,
                allowNull: false
            },
            used_at: {
                type: Sequelize.DATE,
                allowNull: true
            },
            used_by: {
                type: Sequelize.INTEGER,
                allowNull: true
            },
            created_by: {
                type: Sequelize.INTEGER,
                allowNull: false
            },
            created_at: {
                type: Sequelize.DATE,
                allowNull: false,
                defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
            }
        });

        // Add indexes for performance
        await queryInterface.addIndex('receive_tokens', ['token_hash']);
        await queryInterface.addIndex('receive_tokens', ['created_by']);
        await queryInterface.addIndex('receive_tokens', ['used_by']);
    },

    async down(queryInterface, Sequelize) {
        await queryInterface.dropTable('receive_tokens');
    }
};
