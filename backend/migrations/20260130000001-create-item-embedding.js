'use strict';

module.exports = {
    up: async (queryInterface, Sequelize) => {
        await queryInterface.createTable('item_embeddings', {
            embedding_id: {
                allowNull: false,
                autoIncrement: true,
                primaryKey: true,
                type: Sequelize.INTEGER
            },
            item_id: {
                type: Sequelize.INTEGER,
                allowNull: false,
                unique: true,
                references: {
                    model: 'items',
                    key: 'item_id'
                },
                onUpdate: 'CASCADE',
                onDelete: 'CASCADE'
            },
            vector: {
                type: Sequelize.TEXT('long'), // For storing JSON array of floats
                allowNull: false,
                comment: 'JSON stringified array of floats from OpenAI embedding model'
            },
            created_at: {
                allowNull: false,
                type: Sequelize.DATE,
                defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
            },
            updated_at: {
                allowNull: false,
                type: Sequelize.DATE,
                defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
            }
        });

        // Add index on item_id for faster lookups
        await queryInterface.addIndex('item_embeddings', ['item_id']);
    },

    down: async (queryInterface, Sequelize) => {
        await queryInterface.dropTable('item_embeddings');
    }
};
