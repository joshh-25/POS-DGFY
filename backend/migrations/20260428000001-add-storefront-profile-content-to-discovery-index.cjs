'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
    async up(queryInterface, Sequelize) {
        await queryInterface.addColumn('storefront_discovery_index', 'storefront_tagline', {
            type: Sequelize.STRING(120),
            allowNull: true
        });
        await queryInterface.addColumn('storefront_discovery_index', 'storefront_about', {
            type: Sequelize.STRING(1000),
            allowNull: true
        });
        await queryInterface.addColumn('storefront_discovery_index', 'storefront_phone', {
            type: Sequelize.STRING(50),
            allowNull: true
        });
        await queryInterface.addColumn('storefront_discovery_index', 'storefront_email', {
            type: Sequelize.STRING(120),
            allowNull: true
        });
        await queryInterface.addColumn('storefront_discovery_index', 'storefront_hours', {
            type: Sequelize.STRING(120),
            allowNull: true
        });
        await queryInterface.addColumn('storefront_discovery_index', 'storefront_why_choose_us', {
            type: Sequelize.JSON,
            allowNull: true
        });
        await queryInterface.addColumn('storefront_discovery_index', 'storefront_social_links', {
            type: Sequelize.JSON,
            allowNull: true
        });
        await queryInterface.addColumn('storefront_discovery_index', 'storefront_review_highlights', {
            type: Sequelize.JSON,
            allowNull: true
        });
        await queryInterface.addColumn('storefront_discovery_index', 'storefront_promo', {
            type: Sequelize.JSON,
            allowNull: true
        });
    },

    async down(queryInterface) {
        await queryInterface.removeColumn('storefront_discovery_index', 'storefront_promo');
        await queryInterface.removeColumn('storefront_discovery_index', 'storefront_review_highlights');
        await queryInterface.removeColumn('storefront_discovery_index', 'storefront_social_links');
        await queryInterface.removeColumn('storefront_discovery_index', 'storefront_why_choose_us');
        await queryInterface.removeColumn('storefront_discovery_index', 'storefront_hours');
        await queryInterface.removeColumn('storefront_discovery_index', 'storefront_email');
        await queryInterface.removeColumn('storefront_discovery_index', 'storefront_phone');
        await queryInterface.removeColumn('storefront_discovery_index', 'storefront_about');
        await queryInterface.removeColumn('storefront_discovery_index', 'storefront_tagline');
    }
};
