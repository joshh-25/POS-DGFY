'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
    async up(queryInterface, Sequelize) {
        // Add is_subproduct column to identify when an ingredient is itself a product
        await queryInterface.addColumn('product_composition', 'is_subproduct', {
            type: Sequelize.BOOLEAN,
            allowNull: true,
            defaultValue: false,
            comment: 'TRUE if the ingredient is itself a product (category=product)'
        }).catch(err => { if (err.original && err.original.code === 'ER_DUP_FIELDNAME') return; throw err; });

        // Add index for efficient subproduct filtering
        try {
            await queryInterface.addIndex('product_composition', ['is_subproduct'], {
                name: 'idx_product_composition_is_subproduct'
            });
        } catch (e) { }
    },

    async down(queryInterface, Sequelize) {
        await queryInterface.removeIndex('product_composition', 'idx_product_composition_is_subproduct');
        await queryInterface.removeColumn('product_composition', 'is_subproduct');
    }
};
