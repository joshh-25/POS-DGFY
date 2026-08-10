'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
    async up(queryInterface, Sequelize) {
        // Add sale_price_per_unit to dispatch_order_lines
        await queryInterface.addColumn('dispatch_order_lines', 'sale_price_per_unit', {
            type: Sequelize.DECIMAL(10, 4),
            allowNull: true,
            comment: 'Snapshot of selling price at time of DO creation. Null for internal transfers.',
            after: 'cost_per_unit'
        });

        // Add default_sale_price to items
        await queryInterface.addColumn('items', 'default_sale_price', {
            type: Sequelize.DECIMAL(10, 4),
            allowNull: true,
            comment: 'Last-used sale price for this item. Auto-updated on each DO dispatch. Defaults to cost_per_unit on first use.',
            after: 'cost_per_unit'
        });
    },

    async down(queryInterface, Sequelize) {
        await queryInterface.removeColumn('dispatch_order_lines', 'sale_price_per_unit');
        await queryInterface.removeColumn('items', 'default_sale_price');
    }
};
