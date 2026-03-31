'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
    async up(queryInterface, Sequelize) {
        await queryInterface.createTable('storefront_discovery_index', {
            storefront_discovery_index_id: {
                type: Sequelize.BIGINT.UNSIGNED,
                allowNull: false,
                autoIncrement: true,
                primaryKey: true
            },
            tenant_id: {
                type: Sequelize.UUID,
                allowNull: false
            },
            tenant_name: {
                type: Sequelize.STRING(255),
                allowNull: false
            },
            tenant_company_token: {
                type: Sequelize.STRING(255),
                allowNull: false
            },
            slug: {
                type: Sequelize.STRING(120),
                allowNull: false
            },
            storefront_open: {
                type: Sequelize.BOOLEAN,
                allowNull: false,
                defaultValue: true
            },
            is_visible: {
                type: Sequelize.BOOLEAN,
                allowNull: false,
                defaultValue: true
            },
            location_id: {
                type: Sequelize.BIGINT.UNSIGNED,
                allowNull: true
            },
            location_name: {
                type: Sequelize.STRING(255),
                allowNull: true
            },
            address_line: {
                type: Sequelize.STRING(255),
                allowNull: true
            },
            latitude: {
                type: Sequelize.DECIMAL(10, 7),
                allowNull: true
            },
            longitude: {
                type: Sequelize.DECIMAL(10, 7),
                allowNull: true
            },
            delivery_radius_km: {
                type: Sequelize.DECIMAL(10, 2),
                allowNull: false,
                defaultValue: 0
            },
            estimated_wait_minutes: {
                type: Sequelize.INTEGER,
                allowNull: false,
                defaultValue: 15
            },
            supports_delivery: {
                type: Sequelize.BOOLEAN,
                allowNull: false,
                defaultValue: true
            },
            supports_pickup: {
                type: Sequelize.BOOLEAN,
                allowNull: false,
                defaultValue: true
            },
            supports_dine_in: {
                type: Sequelize.BOOLEAN,
                allowNull: false,
                defaultValue: true
            },
            store_delivery_fee: {
                type: Sequelize.DECIMAL(10, 2),
                allowNull: false,
                defaultValue: 0
            },
            catalog_count: {
                type: Sequelize.INTEGER.UNSIGNED,
                allowNull: false,
                defaultValue: 0
            },
            source_updated_at: {
                type: Sequelize.DATE,
                allowNull: true
            },
            last_synced_at: {
                type: Sequelize.DATE,
                allowNull: false
            },
            created_at: {
                type: Sequelize.DATE,
                allowNull: false
            },
            updated_at: {
                type: Sequelize.DATE,
                allowNull: false
            }
        });

        await queryInterface.addIndex('storefront_discovery_index', ['tenant_id'], {
            name: 'idx_storefront_discovery_index_tenant_id',
            unique: true
        });
        await queryInterface.addIndex('storefront_discovery_index', ['slug'], {
            name: 'idx_storefront_discovery_index_slug',
            unique: true
        });
        await queryInterface.addIndex('storefront_discovery_index', ['is_visible', 'storefront_open'], {
            name: 'idx_storefront_discovery_index_visible_open'
        });
        await queryInterface.addIndex('storefront_discovery_index', ['tenant_name'], {
            name: 'idx_storefront_discovery_index_tenant_name'
        });
    },

    async down(queryInterface) {
        await queryInterface.dropTable('storefront_discovery_index');
    }
};

