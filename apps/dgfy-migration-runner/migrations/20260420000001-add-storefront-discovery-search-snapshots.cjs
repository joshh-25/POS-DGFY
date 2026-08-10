'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
    async up(queryInterface, Sequelize) {
        await queryInterface.addColumn('storefront_discovery_index', 'active_location_snapshot', {
            type: Sequelize.JSON,
            allowNull: true
        });

        await queryInterface.addColumn('storefront_discovery_index', 'item_search_snapshot', {
            type: Sequelize.JSON,
            allowNull: true
        });

        await queryInterface.addColumn('storefront_discovery_index', 'search_snapshot_version', {
            type: Sequelize.INTEGER.UNSIGNED,
            allowNull: false,
            defaultValue: 1
        });
    },

    async down(queryInterface) {
        await queryInterface.removeColumn('storefront_discovery_index', 'search_snapshot_version');
        await queryInterface.removeColumn('storefront_discovery_index', 'item_search_snapshot');
        await queryInterface.removeColumn('storefront_discovery_index', 'active_location_snapshot');
    }
};
