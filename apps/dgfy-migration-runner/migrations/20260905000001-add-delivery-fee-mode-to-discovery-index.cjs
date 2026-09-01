'use strict';

// Phase 242 (#1333, epic #1321). Denormalizes the tenant's configured delivery-fee mode onto the
// discovery index so a discovery card can label its advertised `store_delivery_fee` correctly --
// that scalar is redefined by this phase as a FROM-price (the fixed fee, the calc `min_fee`, or 0)
// and is ambiguous without the mode alongside it.
//
// Landlord-DB table (one DB, not per-tenant) -- a single addColumn here is the complete change, no
// sync-tenant-schemas.js repair entry and no tenant fan-out, same as
// 20260820000002-add-storefront-vouchers-to-discovery-index.cjs.
//
// VARCHAR(32), not ENUM: `workflow_mode` and `entity_type` on this same table are both plain
// strings, and ADR 0078 reserves `provider_quoted` as a future fourth mode -- an ENUM would need a
// MODIFY to widen. DEFAULT 'fixed' matches deliveryFeeConfig.js's DEFAULT_MODE, so every pre-existing
// row reads correctly with zero backfill (the next reconciliation sweep overwrites it anyway).

/** @type {import('sequelize-cli').Migration} */
module.exports = {
    async up(queryInterface, Sequelize) {
        const table = await queryInterface.describeTable('storefront_discovery_index');
        if (table.delivery_fee_mode) return;
        await queryInterface.addColumn('storefront_discovery_index', 'delivery_fee_mode', {
            type: Sequelize.STRING(32),
            allowNull: false,
            defaultValue: 'fixed'
        });
    },

    async down(queryInterface) {
        const table = await queryInterface.describeTable('storefront_discovery_index');
        if (!table.delivery_fee_mode) return;
        await queryInterface.removeColumn('storefront_discovery_index', 'delivery_fee_mode');
    }
};
