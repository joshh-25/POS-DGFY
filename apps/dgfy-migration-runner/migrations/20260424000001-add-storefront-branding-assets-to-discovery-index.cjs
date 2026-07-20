'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
    async up(queryInterface, Sequelize) {
        await queryInterface.addColumn('storefront_discovery_index', 'storefront_cover_image_url', {
            type: Sequelize.STRING(500),
            allowNull: true
        });
        await queryInterface.addColumn('storefront_discovery_index', 'storefront_profile_image_url', {
            type: Sequelize.STRING(500),
            allowNull: true
        });
    },

    async down(queryInterface) {
        await queryInterface.removeColumn('storefront_discovery_index', 'storefront_profile_image_url');
        await queryInterface.removeColumn('storefront_discovery_index', 'storefront_cover_image_url');
    }
};
