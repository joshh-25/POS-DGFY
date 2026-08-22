'use strict';

// #713 fix (found live 2026-08-20 while testing #695). storefrontDiscoveryIndexService.js's
// buildPublicStorefrontVouchers computed storefront_vouchers correctly the whole time, but the
// Landlord StorefrontDiscoveryIndex model never declared the column -- Sequelize silently drops any
// key a model doesn't declare when persisting, so the value never survived syncStorefrontDiscoveryIndexForTenant's
// `.create(snapshot)`. This is a landlord-DB table (one DB, not per-tenant), so a single addColumn
// here is the complete fix -- no sync-tenant-schemas.js repair entry needed, unlike vouchers.is_publicly_listed.

/** @type {import('sequelize-cli').Migration} */
module.exports = {
    async up(queryInterface, Sequelize) {
        const table = await queryInterface.describeTable('storefront_discovery_index');
        if (table.storefront_vouchers) return;
        await queryInterface.addColumn('storefront_discovery_index', 'storefront_vouchers', {
            type: Sequelize.JSON,
            allowNull: true
        });
    },

    async down(queryInterface) {
        const table = await queryInterface.describeTable('storefront_discovery_index');
        if (!table.storefront_vouchers) return;
        await queryInterface.removeColumn('storefront_discovery_index', 'storefront_vouchers');
    }
};
