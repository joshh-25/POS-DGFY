/**
 * Migration: Create Item Folders
 *
 * Creates the item_folders table for logical grouping of inventory items.
 */

export default {
    async up(queryInterface, Sequelize) {
        await queryInterface.createTable('item_folders', {
            folder_id: {
                type: Sequelize.INTEGER,
                primaryKey: true,
                autoIncrement: true
            },
            name: {
                type: Sequelize.STRING(100),
                allowNull: false,
                unique: true
            },
            description: {
                type: Sequelize.TEXT,
                allowNull: true
            },
            parent_id: {
                type: Sequelize.INTEGER,
                allowNull: true,
                references: {
                    model: 'item_folders',
                    key: 'folder_id'
                },
                onDelete: 'SET NULL'
            },
            created_at: {
                type: Sequelize.DATE,
                allowNull: false,
                defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
            },
            updated_at: {
                type: Sequelize.DATE,
                allowNull: false,
                defaultValue: Sequelize.literal('CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP')
            }
        });

        await queryInterface.addIndex('item_folders', ['name'], { name: 'idx_folder_name' });
        await queryInterface.addIndex('item_folders', ['parent_id'], { name: 'idx_folder_parent' });
    },

    async down(queryInterface, Sequelize) {
        await queryInterface.dropTable('item_folders');
    }
};
