/**
 * Migration: Add Folder ID to Items
 *
 * Adds a foreign key column folder_id to the items table
 * to link items to logical folders.
 */

export default {
    async up(queryInterface, Sequelize) {
        await queryInterface.addColumn('items', 'folder_id', {
            type: Sequelize.INTEGER,
            allowNull: true,
            references: {
                model: 'item_folders',
                key: 'folder_id'
            },
            onDelete: 'SET NULL',
            after: 'product_folder' // Attempt to place it near the old field
        });

        await queryInterface.addIndex('items', ['folder_id'], { name: 'idx_items_folder_id' });
    },

    async down(queryInterface, Sequelize) {
        await queryInterface.removeColumn('items', 'folder_id');
    }
};
