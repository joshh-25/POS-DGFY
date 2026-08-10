'use strict';

const normalizeTableName = (table) => {
    if (!table) return '';
    if (typeof table === 'string') return table;
    if (typeof table === 'object') return table.tableName || table.TABLE_NAME || '';
    return '';
};

const tableExists = async (queryInterface, tableName) => {
    const tables = await queryInterface.showAllTables();
    return tables.map(normalizeTableName).includes(tableName);
};

const columnExists = async (queryInterface, tableName, columnName) => {
    try {
        const table = await queryInterface.describeTable(tableName);
        return Boolean(table && table[columnName]);
    } catch {
        return false;
    }
};

module.exports = {
    async up(queryInterface, Sequelize) {
        const hasTerminalShifts = await tableExists(queryInterface, 'pos_terminal_shifts');
        if (hasTerminalShifts && !(await columnExists(queryInterface, 'pos_terminal_shifts', 'location_id'))) {
            await queryInterface.addColumn('pos_terminal_shifts', 'location_id', {
                type: Sequelize.INTEGER,
                allowNull: true,
                references: {
                    model: 'tenant_locations',
                    key: 'location_id'
                },
                onUpdate: 'CASCADE',
                onDelete: 'SET NULL'
            });
            await queryInterface.addIndex('pos_terminal_shifts', ['location_id'], {
                name: 'idx_pos_terminal_shifts_location_id'
            });
            await queryInterface.addIndex('pos_terminal_shifts', ['terminal_id', 'location_id', 'status'], {
                name: 'idx_pos_terminal_shifts_terminal_location_status'
            });
        }

        if (hasTerminalShifts && await tableExists(queryInterface, 'tenant_locations')) {
            await queryInterface.sequelize.query(`
                UPDATE pos_terminal_shifts s
                LEFT JOIN (
                    SELECT
                        shift_id,
                        MIN(location_id) AS inferred_location_id,
                        COUNT(DISTINCT location_id) AS distinct_location_count
                    FROM pos_transactions
                    WHERE shift_id IS NOT NULL
                      AND location_id IS NOT NULL
                    GROUP BY shift_id
                ) tx ON tx.shift_id = s.pos_terminal_shift_id
                LEFT JOIN (
                    SELECT location_id
                    FROM tenant_locations
                    WHERE is_active = 1
                    ORDER BY is_primary_storefront DESC, location_id ASC
                    LIMIT 1
                ) fallback_location ON 1 = 1
                SET s.location_id = CASE
                    WHEN tx.distinct_location_count = 1 THEN tx.inferred_location_id
                    ELSE COALESCE(tx.inferred_location_id, fallback_location.location_id)
                END
                WHERE s.location_id IS NULL
            `);
        }

        if (!(await tableExists(queryInterface, 'pos_shift_location_transitions'))) {
            await queryInterface.createTable('pos_shift_location_transitions', {
                pos_shift_location_transition_id: {
                    type: Sequelize.INTEGER,
                    autoIncrement: true,
                    primaryKey: true
                },
                from_shift_id: {
                    type: Sequelize.INTEGER,
                    allowNull: false,
                    references: {
                        model: 'pos_terminal_shifts',
                        key: 'pos_terminal_shift_id'
                    },
                    onUpdate: 'CASCADE',
                    onDelete: 'CASCADE'
                },
                to_shift_id: {
                    type: Sequelize.INTEGER,
                    allowNull: false,
                    references: {
                        model: 'pos_terminal_shifts',
                        key: 'pos_terminal_shift_id'
                    },
                    onUpdate: 'CASCADE',
                    onDelete: 'CASCADE'
                },
                terminal_id: {
                    type: Sequelize.STRING(100),
                    allowNull: false
                },
                from_location_id: {
                    type: Sequelize.INTEGER,
                    allowNull: true,
                    references: {
                        model: 'tenant_locations',
                        key: 'location_id'
                    },
                    onUpdate: 'CASCADE',
                    onDelete: 'SET NULL'
                },
                to_location_id: {
                    type: Sequelize.INTEGER,
                    allowNull: false,
                    references: {
                        model: 'tenant_locations',
                        key: 'location_id'
                    },
                    onUpdate: 'CASCADE',
                    onDelete: 'RESTRICT'
                },
                reason: {
                    type: Sequelize.STRING(255),
                    allowNull: false
                },
                actor_user_id: {
                    type: Sequelize.INTEGER,
                    allowNull: false,
                    references: {
                        model: 'users',
                        key: 'user_id'
                    },
                    onUpdate: 'CASCADE',
                    onDelete: 'RESTRICT'
                },
                idempotency_key: {
                    type: Sequelize.STRING(120),
                    allowNull: true
                },
                switched_at: {
                    type: Sequelize.DATE,
                    allowNull: false,
                    defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
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

            await queryInterface.addIndex('pos_shift_location_transitions', ['from_shift_id'], {
                name: 'idx_pos_shift_location_transitions_from_shift_id'
            });
            await queryInterface.addIndex('pos_shift_location_transitions', ['to_shift_id'], {
                name: 'idx_pos_shift_location_transitions_to_shift_id'
            });
            await queryInterface.addIndex('pos_shift_location_transitions', ['terminal_id'], {
                name: 'idx_pos_shift_location_transitions_terminal_id'
            });
            await queryInterface.addIndex('pos_shift_location_transitions', ['actor_user_id'], {
                name: 'idx_pos_shift_location_transitions_actor_user_id'
            });
            await queryInterface.addIndex('pos_shift_location_transitions', ['to_location_id'], {
                name: 'idx_pos_shift_location_transitions_to_location_id'
            });
            await queryInterface.addIndex('pos_shift_location_transitions', ['idempotency_key'], {
                unique: true,
                name: 'uq_pos_shift_location_transitions_idempotency_key'
            });
        }

        if (await tableExists(queryInterface, 'system_settings')) {
            await queryInterface.sequelize.query(`
                INSERT INTO system_settings (setting_key, setting_value, data_type, description, updated_at)
                SELECT
                    'pos_terminal_location_binding_enforced',
                    'false',
                    'boolean',
                    'Strictly bind POS terminal shifts and checkout to location-scoped terminal registry entries.',
                    CURRENT_TIMESTAMP
                FROM DUAL
                WHERE NOT EXISTS (
                    SELECT 1
                    FROM system_settings
                    WHERE setting_key = 'pos_terminal_location_binding_enforced'
                )
            `);
        }
    },

    async down(queryInterface) {
        if (await tableExists(queryInterface, 'system_settings')) {
            await queryInterface.sequelize.query(`
                DELETE FROM system_settings
                WHERE setting_key = 'pos_terminal_location_binding_enforced'
            `);
        }

        if (await tableExists(queryInterface, 'pos_shift_location_transitions')) {
            await queryInterface.dropTable('pos_shift_location_transitions');
        }

        if (await tableExists(queryInterface, 'pos_terminal_shifts')) {
            if (await columnExists(queryInterface, 'pos_terminal_shifts', 'location_id')) {
                await queryInterface.removeIndex('pos_terminal_shifts', 'idx_pos_terminal_shifts_terminal_location_status').catch(() => {});
                await queryInterface.removeIndex('pos_terminal_shifts', 'idx_pos_terminal_shifts_location_id').catch(() => {});
                await queryInterface.removeColumn('pos_terminal_shifts', 'location_id');
            }
        }
    }
};
