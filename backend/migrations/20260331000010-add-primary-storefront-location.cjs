'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
    async up(queryInterface, Sequelize) {
        const table = await queryInterface.describeTable('tenant_locations');

        if (!table.is_primary_storefront) {
            await queryInterface.addColumn('tenant_locations', 'is_primary_storefront', {
                type: Sequelize.BOOLEAN,
                allowNull: false,
                defaultValue: false
            });
        }

        const indexes = await queryInterface.showIndex('tenant_locations');
        const hasPrimaryIndex = (indexes || []).some((index) => index.name === 'idx_tenant_locations_primary_active');
        if (!hasPrimaryIndex) {
            await queryInterface.addIndex('tenant_locations', ['is_primary_storefront', 'is_active'], {
                name: 'idx_tenant_locations_primary_active'
            });
        }

        await queryInterface.sequelize.query(
            'UPDATE tenant_locations SET is_primary_storefront = FALSE WHERE is_primary_storefront IS NULL'
        );

        const [activeRows] = await queryInterface.sequelize.query(`
            SELECT location_id
            FROM tenant_locations
            WHERE is_active = TRUE
            ORDER BY is_open DESC, updated_at DESC, location_id DESC
            LIMIT 1
        `);

        const fallbackRows = activeRows?.length
            ? activeRows
            : (await queryInterface.sequelize.query(`
                SELECT location_id
                FROM tenant_locations
                ORDER BY updated_at DESC, location_id DESC
                LIMIT 1
            `))[0];

        const primaryLocationId = fallbackRows?.[0]?.location_id ?? null;
        if (primaryLocationId) {
            await queryInterface.sequelize.query(
                'UPDATE tenant_locations SET is_primary_storefront = FALSE'
            );
            await queryInterface.sequelize.query(
                'UPDATE tenant_locations SET is_primary_storefront = TRUE WHERE location_id = ?',
                { replacements: [primaryLocationId] }
            );
        }
    },

    async down(queryInterface) {
        const indexes = await queryInterface.showIndex('tenant_locations');
        const hasPrimaryIndex = (indexes || []).some((index) => index.name === 'idx_tenant_locations_primary_active');
        if (hasPrimaryIndex) {
            await queryInterface.removeIndex('tenant_locations', 'idx_tenant_locations_primary_active');
        }

        const table = await queryInterface.describeTable('tenant_locations');
        if (table.is_primary_storefront) {
            await queryInterface.removeColumn('tenant_locations', 'is_primary_storefront');
        }
    }
};
