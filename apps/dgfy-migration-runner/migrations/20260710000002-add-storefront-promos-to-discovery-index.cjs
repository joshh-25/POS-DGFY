'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
    async up(queryInterface, Sequelize) {
        await queryInterface.addColumn('storefront_discovery_index', 'storefront_promos', {
            type: Sequelize.JSON,
            allowNull: true
        });
    },

    async down(queryInterface) {
        await queryInterface.removeColumn('storefront_discovery_index', 'storefront_promos');
    }
};
