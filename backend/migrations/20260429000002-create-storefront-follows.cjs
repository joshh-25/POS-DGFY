'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
    async up(queryInterface, Sequelize) {
        await queryInterface.createTable('storefront_follows', {
            storefront_follow_id: {
                type: Sequelize.BIGINT.UNSIGNED,
                autoIncrement: true,
                primaryKey: true
            },
            tenant_id: {
                type: Sequelize.STRING(64),
                allowNull: false
            },
            storefront_slug: {
                type: Sequelize.STRING(120),
                allowNull: false
            },
            visitor_fingerprint: {
                type: Sequelize.STRING(128),
                allowNull: false
            },
            created_at: {
                type: Sequelize.DATE,
                allowNull: false,
                defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
            },
            updated_at: {
                type: Sequelize.DATE,
                allowNull: false,
                defaultValue: Sequelize.literal('CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP')
            }
        });

        await queryInterface.addIndex(
            'storefront_follows',
            ['tenant_id', 'storefront_slug', 'visitor_fingerprint'],
            {
                name: 'idx_storefront_follows_unique_visitor',
                unique: true
            }
        );
        await queryInterface.addIndex(
            'storefront_follows',
            ['tenant_id', 'storefront_slug'],
            {
                name: 'idx_storefront_follows_slug'
            }
        );
    },

    async down(queryInterface) {
        await queryInterface.dropTable('storefront_follows');
    }
};
