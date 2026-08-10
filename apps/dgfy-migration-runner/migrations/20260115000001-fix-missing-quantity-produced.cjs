'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
    async up(queryInterface, Sequelize) {
        await queryInterface.addColumn('job_orders', 'quantity_produced', {
            type: Sequelize.DECIMAL(10, 2),
            defaultValue: 0,
            allowNull: false
        });
    },

    async down(queryInterface, Sequelize) {
        await queryInterface.removeColumn('job_orders', 'quantity_produced');
    }
};
