'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
    async up(queryInterface, Sequelize) {
        await queryInterface.addColumn('storefront_discovery_index', 'storefront_ui_v2_enabled', {
            type: Sequelize.BOOLEAN,
            allowNull: false,
            defaultValue: false
        });
        await queryInterface.addColumn('storefront_discovery_index', 'storefront_categories', {
            type: Sequelize.JSON,
            allowNull: true
        });
        await queryInterface.addColumn('storefront_discovery_index', 'storefront_gallery_images', {
            type: Sequelize.JSON,
            allowNull: true
        });
        await queryInterface.addColumn('storefront_discovery_index', 'storefront_delivery_partners', {
            type: Sequelize.JSON,
            allowNull: true
        });
        await queryInterface.addColumn('storefront_discovery_index', 'storefront_follow_enabled', {
            type: Sequelize.BOOLEAN,
            allowNull: false,
            defaultValue: false
        });
        await queryInterface.addColumn('storefront_discovery_index', 'storefront_share_enabled', {
            type: Sequelize.BOOLEAN,
            allowNull: false,
            defaultValue: false
        });
        await queryInterface.addColumn('storefront_discovery_index', 'storefront_review_summary', {
            type: Sequelize.JSON,
            allowNull: true
        });
    },

    async down(queryInterface) {
        await queryInterface.removeColumn('storefront_discovery_index', 'storefront_review_summary');
        await queryInterface.removeColumn('storefront_discovery_index', 'storefront_share_enabled');
        await queryInterface.removeColumn('storefront_discovery_index', 'storefront_follow_enabled');
        await queryInterface.removeColumn('storefront_discovery_index', 'storefront_delivery_partners');
        await queryInterface.removeColumn('storefront_discovery_index', 'storefront_gallery_images');
        await queryInterface.removeColumn('storefront_discovery_index', 'storefront_categories');
        await queryInterface.removeColumn('storefront_discovery_index', 'storefront_ui_v2_enabled');
    }
};
