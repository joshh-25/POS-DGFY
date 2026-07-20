'use strict';

const REPLAY_STATUS_ENUM = ['processed', 'blocked'];

const normalizeTableName = (table) => {
    if (!table) return '';
    if (typeof table === 'string') return table;
    if (typeof table === 'object') {
        return table.tableName || table.TABLE_NAME || '';
    }
    return '';
};

const tableExists = async (queryInterface, tableName) => {
    const tables = await queryInterface.showAllTables();
    return tables.map(normalizeTableName).includes(tableName);
};

module.exports = {
    async up(queryInterface, Sequelize) {
        if (await tableExists(queryInterface, 'pos_operation_replays')) {
            return;
        }

        await queryInterface.createTable('pos_operation_replays', {
            pos_operation_replay_id: {
                type: Sequelize.INTEGER,
                autoIncrement: true,
                primaryKey: true
            },
            operation_key: {
                type: Sequelize.STRING(80),
                allowNull: false
            },
            idempotency_key: {
                type: Sequelize.STRING(120),
                allowNull: false
            },
            request_hash: {
                type: Sequelize.STRING(64),
                allowNull: false
            },
            replay_status: {
                type: Sequelize.ENUM(...REPLAY_STATUS_ENUM),
                allowNull: false,
                defaultValue: 'processed'
            },
            response_payload: {
                type: Sequelize.JSON,
                allowNull: true
            },
            created_by: {
                type: Sequelize.INTEGER,
                allowNull: true,
                references: {
                    model: 'users',
                    key: 'user_id'
                },
                onUpdate: 'CASCADE',
                onDelete: 'SET NULL'
            },
            created_at: {
                type: Sequelize.DATE,
                allowNull: false,
                defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
            },
            updated_at: {
                type: Sequelize.DATE,
                allowNull: false,
                defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
            }
        });

        await queryInterface.addIndex('pos_operation_replays', ['operation_key', 'idempotency_key'], {
            unique: true,
            name: 'uniq_pos_operation_replays_operation_key'
        });
        await queryInterface.addIndex('pos_operation_replays', ['created_at'], {
            name: 'idx_pos_operation_replays_created_at'
        });
    },

    async down(queryInterface) {
        if (await tableExists(queryInterface, 'pos_operation_replays')) {
            await queryInterface.dropTable('pos_operation_replays');
        }
    }
};
