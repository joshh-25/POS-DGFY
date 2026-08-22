'use strict';

const TABLE = 'audit_logs';
const EVENT_INDEX = 'idx_audit_event_timestamp';

const describeTable = async (queryInterface) => queryInterface.describeTable(TABLE).catch(() => null);

const hasIndex = async (queryInterface, indexName) => {
    const indexes = await queryInterface.showIndex(TABLE);
    return (indexes || []).some((index) => String(index?.name || '') === indexName);
};

const COLUMNS = Object.freeze({
    event_type: (Sequelize) => ({ type: Sequelize.STRING(100), allowNull: true }),
    actor_username: (Sequelize) => ({ type: Sequelize.STRING(120), allowNull: true }),
    terminal_id: (Sequelize) => ({ type: Sequelize.STRING(100), allowNull: true }),
    shift_id: (Sequelize) => ({ type: Sequelize.BIGINT, allowNull: true }),
    location_id: (Sequelize) => ({ type: Sequelize.INTEGER, allowNull: true }),
    reason: (Sequelize) => ({ type: Sequelize.STRING(500), allowNull: true }),
    request_id: (Sequelize) => ({ type: Sequelize.STRING(100), allowNull: true })
});

module.exports = {
    async up(queryInterface, Sequelize) {
        const table = await describeTable(queryInterface);
        if (!table) return;

        for (const [column, buildDefinition] of Object.entries(COLUMNS)) {
            if (!table[column]) {
                await queryInterface.addColumn(TABLE, column, buildDefinition(Sequelize));
            }
        }

        if (!await hasIndex(queryInterface, EVENT_INDEX)) {
            await queryInterface.addIndex(TABLE, ['event_type', 'timestamp'], {
                name: EVENT_INDEX
            });
        }
    },

    async down(queryInterface) {
        const table = await describeTable(queryInterface);
        if (!table) return;

        if (await hasIndex(queryInterface, EVENT_INDEX)) {
            await queryInterface.removeIndex(TABLE, EVENT_INDEX);
        }
        for (const column of Object.keys(COLUMNS).reverse()) {
            if (table[column]) {
                await queryInterface.removeColumn(TABLE, column);
            }
        }
    }
};
