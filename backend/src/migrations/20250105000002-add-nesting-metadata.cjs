'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
    async up(queryInterface, Sequelize) {
        // Add nesting metadata columns to items table
        await queryInterface.addColumn('items', 'nesting_level', {
            type: Sequelize.INTEGER,
            allowNull: true,
            defaultValue: 0,
            comment: '0=raw ingredient, 1-3=nested product levels'
        });

        await queryInterface.addColumn('items', 'max_child_depth', {
            type: Sequelize.INTEGER,
            allowNull: true,
            defaultValue: 0,
            comment: 'Maximum depth of any sub-component used'
        });

        await queryInterface.addColumn('items', 'is_leaf_node', {
            type: Sequelize.BOOLEAN,
            allowNull: true,
            defaultValue: true,
            comment: 'FALSE if this item is used as ingredient in another product'
        });

        await queryInterface.addColumn('items', 'composition_hash', {
            type: Sequelize.STRING(64),
            allowNull: true,
            comment: 'Hash of composition for quick circular detection'
        });

        // Add index for efficient nesting level queries
        await queryInterface.addIndex('items', ['nesting_level'], {
            name: 'idx_items_nesting_level'
        });
    },

    async down(queryInterface, Sequelize) {
        await queryInterface.removeIndex('items', 'idx_items_nesting_level');
        await queryInterface.removeColumn('items', 'composition_hash');
        await queryInterface.removeColumn('items', 'is_leaf_node');
        await queryInterface.removeColumn('items', 'max_child_depth');
        await queryInterface.removeColumn('items', 'nesting_level');
    }
};
