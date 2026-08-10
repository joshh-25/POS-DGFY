'use strict';

const TABLE = 'storefront_discovery_index';

const COLUMNS = Object.freeze({
    customer_access_mode: {
        type: 'STRING',
        length: 32,
        allowNull: false,
        defaultValue: 'catalog'
    },
    effective_customer_access_mode: {
        type: 'STRING',
        length: 32,
        allowNull: false,
        defaultValue: 'transaction'
    },
    max_customer_access_mode: {
        type: 'STRING',
        length: 32,
        allowNull: false,
        defaultValue: 'catalog'
    },
    inventory_display_mode: {
        type: 'STRING',
        length: 32,
        allowNull: false,
        defaultValue: 'availability'
    },
    inventory_low_stock_display_threshold: {
        type: 'INTEGER',
        unsigned: true,
        allowNull: false,
        defaultValue: 5
    },
    access_capabilities: {
        type: 'JSON',
        allowNull: true
    },
    access_limitation_reason: {
        type: 'STRING',
        length: 255,
        allowNull: true
    },
    customer_access_modes_enabled: {
        type: 'BOOLEAN',
        allowNull: false,
        defaultValue: false
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

const toSequelizeColumn = (Sequelize, definition) => {
    let type;
    if (definition.type === 'STRING') {
        type = Sequelize.STRING(definition.length || 255);
    } else if (definition.type === 'INTEGER') {
        type = definition.unsigned ? Sequelize.INTEGER.UNSIGNED : Sequelize.INTEGER;
    } else if (definition.type === 'BOOLEAN') {
        type = Sequelize.BOOLEAN;
    } else if (definition.type === 'JSON') {
        type = Sequelize.JSON;
    } else {
        type = Sequelize.STRING;
    }

    return {
        type,
        allowNull: definition.allowNull,
        defaultValue: definition.defaultValue
    };
};

module.exports = {
    async up(queryInterface, Sequelize) {
        if (!(await tableExists(queryInterface))) return;

        for (const [column, definition] of Object.entries(COLUMNS)) {
            if (await columnExists(queryInterface, column)) continue;
            await queryInterface.addColumn(TABLE, column, toSequelizeColumn(Sequelize, definition));
        }
    },

    async down(queryInterface) {
        if (!(await tableExists(queryInterface))) return;

        for (const column of Object.keys(COLUMNS).reverse()) {
            if (!(await columnExists(queryInterface, column))) continue;
            await queryInterface.removeColumn(TABLE, column);
        }
    }
};
