'use strict';

// Phase 88 of issue #482, authorized by ADR 0064 (scoped supersession of ADR 0057 clause 3).
//
// Widens two enums so a service item can declare itself a handoff service and a booking can
// express the pickup-and-return / pickup-and-collection lifecycle:
//
// - `service_item_details.service_area_type` gains `item_handoff` — the fifth member of the
//   existing grain axis (in_store / customer_location / online / hybrid / item_handoff),
//   satisfying ADR 0057 clause 4 (`[binding]`, unchanged) and ADR 0064 clause 7.
// - `service_bookings.status` gains the four round-trip lifecycle values named in the confirmed
//   spec (docs/proposals/2026-08-15-liempyo-laundry-discover-flow-and-gap-analysis.md), additive
//   only - the existing seven values and every transition that uses them are untouched.

const SERVICE_AREA_TYPE_VALUES = [
    'in_store',
    'customer_location',
    'online',
    'hybrid',
    'item_handoff'
];
const SERVICE_AREA_TYPE_VALUES_DOWN = SERVICE_AREA_TYPE_VALUES.filter((value) => value !== 'item_handoff');

const BOOKING_STATUS_VALUES = [
    'requested',
    'confirmed',
    'checked_in',
    'in_service',
    'completed',
    'cancelled',
    'no_show',
    'for_pickup',
    'pickup_completed',
    'out_for_return',
    'ready_for_collection'
];
const BOOKING_STATUS_VALUES_DOWN = BOOKING_STATUS_VALUES.filter((value) => (
    !['for_pickup', 'pickup_completed', 'out_for_return', 'ready_for_collection'].includes(value)
));

module.exports = {
    async up(queryInterface, Sequelize) {
        const serviceItemDetailsTable = await queryInterface.describeTable('service_item_details');

        if (serviceItemDetailsTable.service_area_type) {
            await queryInterface.changeColumn('service_item_details', 'service_area_type', {
                type: Sequelize.ENUM(...SERVICE_AREA_TYPE_VALUES),
                allowNull: false,
                defaultValue: 'in_store'
            });
        }

        const serviceBookingsTable = await queryInterface.describeTable('service_bookings');

        if (serviceBookingsTable.status) {
            await queryInterface.changeColumn('service_bookings', 'status', {
                type: Sequelize.ENUM(...BOOKING_STATUS_VALUES),
                allowNull: false,
                defaultValue: 'requested'
            });
        }
    },

    async down(queryInterface, Sequelize) {
        const serviceBookingsTable = await queryInterface.describeTable('service_bookings');

        if (serviceBookingsTable.status) {
            await queryInterface.sequelize.query(
                "UPDATE service_bookings SET status = 'in_service' "
                + "WHERE status IN ('for_pickup', 'pickup_completed', 'out_for_return', 'ready_for_collection')"
            );
            await queryInterface.changeColumn('service_bookings', 'status', {
                type: Sequelize.ENUM(...BOOKING_STATUS_VALUES_DOWN),
                allowNull: false,
                defaultValue: 'requested'
            });
        }

        const serviceItemDetailsTable = await queryInterface.describeTable('service_item_details');

        if (serviceItemDetailsTable.service_area_type) {
            await queryInterface.sequelize.query(
                "UPDATE service_item_details SET service_area_type = 'in_store' WHERE service_area_type = 'item_handoff'"
            );
            await queryInterface.changeColumn('service_item_details', 'service_area_type', {
                type: Sequelize.ENUM(...SERVICE_AREA_TYPE_VALUES_DOWN),
                allowNull: false,
                defaultValue: 'in_store'
            });
        }
    }
};
