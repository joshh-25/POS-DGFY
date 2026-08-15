'use strict';

// Phase 88 of issue #482, authorized by ADR 0064 decision 4 (`[default]`). Closes the
// no-timestamps gap named in ADR 0064's Context: buildUpdateServiceBookingStatusUseCase writes
// only `status` and `cancellation_reason` today, so a booking's lifecycle history does not exist
// anywhere - as a side effect this is also the persistence gap behind the planned `laborTracking`
// module. `service_bookings.status` itself stays a cheap current-state column read; this table is
// additive history alongside it, not a replacement.
//
// `from_status` is nullable to record the first event (booking creation has no prior status).
// `handoff_leg_id` is nullable because most status transitions are not leg-specific (e.g.
// `requested` -> `confirmed`); it is set only when a transition is driven by a specific leg
// completing (e.g. `pickup_completed`).

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
const ACTOR_TYPE_VALUES = ['customer', 'staff', 'system'];
const SOURCE_VALUES = ['storefront', 'pos', 'admin', 'system'];

const normalizeTableName = (table) => {
    if (!table) return '';
    if (typeof table === 'string') return table;
    if (typeof table === 'object') return table.tableName || table.TABLE_NAME || '';
    return '';
};

const tableExists = async (queryInterface, tableName) => {
    const tables = await queryInterface.showAllTables();
    return tables.some((table) => normalizeTableName(table).toLowerCase() === tableName.toLowerCase());
};

module.exports = {
    async up(queryInterface, Sequelize) {
        if (await tableExists(queryInterface, 'service_booking_status_events')) {
            return;
        }

        await queryInterface.createTable('service_booking_status_events', {
            status_event_id: {
                type: Sequelize.INTEGER,
                autoIncrement: true,
                primaryKey: true
            },
            booking_id: {
                type: Sequelize.INTEGER,
                allowNull: false,
                references: { model: 'service_bookings', key: 'booking_id' },
                onUpdate: 'RESTRICT',
                onDelete: 'CASCADE'
            },
            from_status: {
                type: Sequelize.ENUM(...BOOKING_STATUS_VALUES),
                allowNull: true
            },
            to_status: {
                type: Sequelize.ENUM(...BOOKING_STATUS_VALUES),
                allowNull: false
            },
            handoff_leg_id: {
                type: Sequelize.INTEGER,
                allowNull: true,
                references: { model: 'service_booking_handoff_legs', key: 'handoff_leg_id' },
                onUpdate: 'RESTRICT',
                onDelete: 'SET NULL'
            },
            actor_type: {
                type: Sequelize.ENUM(...ACTOR_TYPE_VALUES),
                allowNull: false,
                defaultValue: 'system'
            },
            actor_user_id: {
                type: Sequelize.INTEGER,
                allowNull: true,
                references: { model: 'users', key: 'user_id' },
                onUpdate: 'RESTRICT',
                onDelete: 'SET NULL'
            },
            source: {
                type: Sequelize.ENUM(...SOURCE_VALUES),
                allowNull: false,
                defaultValue: 'system'
            },
            reason: {
                type: Sequelize.STRING(500),
                allowNull: true
            },
            occurred_at: {
                type: Sequelize.DATE,
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

        await queryInterface.addIndex('service_booking_status_events', ['booking_id', 'occurred_at'], {
            name: 'idx_service_booking_status_events_booking_occurred'
        });
        await queryInterface.addIndex('service_booking_status_events', ['handoff_leg_id'], {
            name: 'idx_service_booking_status_events_handoff_leg'
        });
        await queryInterface.addIndex('service_booking_status_events', ['actor_user_id'], {
            name: 'idx_service_booking_status_events_actor_user'
        });
    },

    async down(queryInterface) {
        if (await tableExists(queryInterface, 'service_booking_status_events')) {
            await queryInterface.dropTable('service_booking_status_events');
        }
    }
};
