'use strict';

const TABLE = 'storefront_discovery_index';
const ENTITY_TYPE_INDEX = 'storefront_discovery_index_entity_type_idx';
const EXTERNAL_SOURCE_INDEX = 'storefront_discovery_index_external_source_idx';

const COLUMNS = Object.freeze({
    entity_type: {
        type: 'STRING',
        length: 32,
        allowNull: false,
        defaultValue: 'dgfy_native'
    },
    external_provider: {
        type: 'STRING',
        length: 60,
        allowNull: true
    },
    external_reference_id: {
        type: 'STRING',
        length: 120,
        allowNull: true
    },
    external_storefront_url: {
        type: 'STRING',
        length: 500,
        allowNull: true
    }
});

const normalizeTableName = (table) => {
    if (!table) return '';
    if (typeof table === 'string') return table;
    return table.tableName || table.TABLE_NAME || '';
};

const tableExists = async (queryInterface) => {
    const tables = await queryInterface.showAllTables();
    return (tables || []).map(normalizeTableName).includes(TABLE);
};

const columnExists = async (queryInterface, column) => {
    const description = await queryInterface.describeTable(TABLE);
    return Object.prototype.hasOwnProperty.call(description, column);
};

const indexExists = async (queryInterface, indexName) => {
    const indexes = await queryInterface.showIndex(TABLE);
    return (indexes || []).some((index) => index.name === indexName);
};

const toSequelizeColumn = (Sequelize, definition) => ({
    type: Sequelize.STRING(definition.length || 255),
    allowNull: definition.allowNull,
    defaultValue: definition.defaultValue
});

module.exports = {
    async up(queryInterface, Sequelize) {
        if (!(await tableExists(queryInterface))) return;

        for (const [column, definition] of Object.entries(COLUMNS)) {
            if (await columnExists(queryInterface, column)) continue;
            await queryInterface.addColumn(TABLE, column, toSequelizeColumn(Sequelize, definition));
        }

        // Native DGFY tenants remain the only entities that must resolve to a real
        // Tenant row; external listings (entity_type: 'external_listing') have no
        // tenant of their own, so these two columns can no longer be NOT NULL.
        await queryInterface.changeColumn(TABLE, 'tenant_id', {
            type: Sequelize.UUID,
            allowNull: true
        });
        await queryInterface.changeColumn(TABLE, 'tenant_company_token', {
            type: Sequelize.STRING(255),
            allowNull: true
        });

        if (!(await indexExists(queryInterface, ENTITY_TYPE_INDEX))) {
            await queryInterface.addIndex(TABLE, ['entity_type'], { name: ENTITY_TYPE_INDEX });
        }
        if (!(await indexExists(queryInterface, EXTERNAL_SOURCE_INDEX))) {
            await queryInterface.addIndex(TABLE, ['external_provider', 'external_reference_id'], {
                name: EXTERNAL_SOURCE_INDEX
            });
        }
    },

    async down(queryInterface, Sequelize) {
        if (!(await tableExists(queryInterface))) return;

        if (await indexExists(queryInterface, EXTERNAL_SOURCE_INDEX)) {
            await queryInterface.removeIndex(TABLE, EXTERNAL_SOURCE_INDEX);
        }
        if (await indexExists(queryInterface, ENTITY_TYPE_INDEX)) {
            await queryInterface.removeIndex(TABLE, ENTITY_TYPE_INDEX);
        }

        await queryInterface.changeColumn(TABLE, 'tenant_company_token', {
            type: Sequelize.STRING(255),
            allowNull: false
        });
        await queryInterface.changeColumn(TABLE, 'tenant_id', {
            type: Sequelize.UUID,
            allowNull: false
        });

        for (const column of Object.keys(COLUMNS).reverse()) {
            if (!(await columnExists(queryInterface, column))) continue;
            await queryInterface.removeColumn(TABLE, column);
        }
    }
};
