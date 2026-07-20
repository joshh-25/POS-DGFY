'use strict';

const addIndexIfMissing = async (queryInterface, tableName, fields, name) => {
    try {
        await queryInterface.addIndex(tableName, fields, { name });
    } catch (error) {
        const message = String(error?.message || '');
        if (!message.includes('Duplicate key name') && !message.includes('already exists')) {
            throw error;
        }
    }
};

const removeIndexIfExists = async (queryInterface, tableName, name) => {
    try {
        await queryInterface.removeIndex(tableName, name);
    } catch {
        // no-op
    }
};

/** @type {import('sequelize-cli').Migration} */
module.exports = {
    async up(queryInterface) {
        await addIndexIfMissing(
            queryInterface,
            'storefront_discovery_index',
            ['is_visible', 'storefront_open', 'tenant_name'],
            'idx_storefront_discovery_visible_open_name'
        );
        await addIndexIfMissing(
            queryInterface,
            'storefront_discovery_index',
            ['slug', 'is_visible'],
            'idx_storefront_discovery_slug_visible'
        );
        await addIndexIfMissing(
            queryInterface,
            'pos_transactions',
            ['order_source', 'fulfillment_status', 'location_id', 'created_at'],
            'idx_pos_transactions_incoming_location_queue'
        );
        await addIndexIfMissing(
            queryInterface,
            'pos_transactions',
            ['order_source', 'fulfillment_status', 'created_at'],
            'idx_pos_transactions_incoming_global_queue'
        );
    },

    async down(queryInterface) {
        await removeIndexIfExists(queryInterface, 'storefront_discovery_index', 'idx_storefront_discovery_visible_open_name');
        await removeIndexIfExists(queryInterface, 'storefront_discovery_index', 'idx_storefront_discovery_slug_visible');
        await removeIndexIfExists(queryInterface, 'pos_transactions', 'idx_pos_transactions_incoming_location_queue');
        await removeIndexIfExists(queryInterface, 'pos_transactions', 'idx_pos_transactions_incoming_global_queue');
    }
};

