'use strict';

// Phase 88 of issue #482, authorized by ADR 0064 (scoped supersession of ADR 0057 clause 3,
// decision 2). The genuinely new entity in this ADR: neither ServiceBooking, PosTransaction, nor
// DeliveryJob models custody of an item in transit. Keyed off booking_id, mirroring
// ServiceBookingLine (not off pos_transaction_id, unlike DeliveryJob - see ADR 0064's Context for
// why DeliveryJob structurally cannot serve here).
//
// One row per direction per booking (uq_service_booking_handoff_legs_booking_direction): exactly
// one inbound leg, exactly one outbound leg. Per ADR 0064 decision 3, no fulfillment-profile key
// is stored anywhere on this table - the (inbound method, outbound method) pair is what the
// Phase 89 API contract derives the profile from.
//
// Address columns follow the house pattern (StoreCustomerAddress book + PosTransaction snapshot,
// see apps/dgfy-api/src/models/PosTransaction.js:103-113): a durable text/lat/lng snapshot on the
// leg itself, plus a nullable FK to customer_addresses for provenance only. DgfyCustomerAddress is
// a landlord table and cannot be FK'd from a tenant row.

const DIRECTION_VALUES = ['inbound', 'outbound'];
const METHOD_VALUES = ['business_pickup', 'business_delivery', 'customer_dropoff', 'customer_collection'];
const LEG_STATUS_VALUES = ['pending', 'scheduled', 'in_transit', 'completed', 'cancelled'];

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
        if (await tableExists(queryInterface, 'service_booking_handoff_legs')) {
            return;
        }

        await queryInterface.createTable('service_booking_handoff_legs', {
            handoff_leg_id: {
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
            direction: {
                type: Sequelize.ENUM(...DIRECTION_VALUES),
                allowNull: false
            },
            method: {
                type: Sequelize.ENUM(...METHOD_VALUES),
                allowNull: false
            },
            address_line: {
                type: Sequelize.TEXT,
                allowNull: true
            },
            latitude: {
                type: Sequelize.DECIMAL(10, 8),
                allowNull: true
            },
            longitude: {
                type: Sequelize.DECIMAL(11, 8),
                allowNull: true
            },
            customer_address_id: {
                type: Sequelize.INTEGER,
                allowNull: true,
                references: { model: 'customer_addresses', key: 'address_id' },
                onUpdate: 'RESTRICT',
                onDelete: 'SET NULL'
            },
            location_id: {
                type: Sequelize.INTEGER,
                allowNull: true,
                references: { model: 'tenant_locations', key: 'location_id' },
                onUpdate: 'RESTRICT',
                onDelete: 'SET NULL'
            },
            scheduled_from: {
                type: Sequelize.DATE,
                allowNull: true
            },
            scheduled_to: {
                type: Sequelize.DATE,
                allowNull: true
            },
            contact_name: {
                type: Sequelize.STRING(255),
                allowNull: true
            },
            contact_phone: {
                type: Sequelize.STRING(50),
                allowNull: true
            },
            instructions: {
                type: Sequelize.STRING(500),
                allowNull: true
            },
            status: {
                type: Sequelize.ENUM(...LEG_STATUS_VALUES),
                allowNull: false,
                defaultValue: 'pending'
            },
            completed_at: {
                type: Sequelize.DATE,
                allowNull: true
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

        await queryInterface.addIndex('service_booking_handoff_legs', ['booking_id', 'direction'], {
            name: 'uq_service_booking_handoff_legs_booking_direction',
            unique: true
        });
        await queryInterface.addIndex('service_booking_handoff_legs', ['customer_address_id'], {
            name: 'idx_service_booking_handoff_legs_customer_address'
        });
        await queryInterface.addIndex('service_booking_handoff_legs', ['location_id'], {
            name: 'idx_service_booking_handoff_legs_location'
        });
        await queryInterface.addIndex('service_booking_handoff_legs', ['status'], {
            name: 'idx_service_booking_handoff_legs_status'
        });
        await queryInterface.addIndex('service_booking_handoff_legs', ['scheduled_from'], {
            name: 'idx_service_booking_handoff_legs_scheduled_from'
        });
    },

    async down(queryInterface) {
        if (await tableExists(queryInterface, 'service_booking_handoff_legs')) {
            await queryInterface.dropTable('service_booking_handoff_legs');
        }
    }
};
