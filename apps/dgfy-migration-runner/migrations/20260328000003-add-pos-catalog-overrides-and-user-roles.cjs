'use strict';

const LEGACY_USER_ROLES = ['admin', 'manager', 'staff'];
const EXTENDED_USER_ROLES = ['admin', 'manager', 'staff', 'cashier', 'po', 'do', 'jo'];

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

const insertSettingIfMissing = async (queryInterface, settingKey, settingValue, dataType, description) => {
    const [rows] = await queryInterface.sequelize.query(
        'SELECT setting_key FROM system_settings WHERE setting_key = :settingKey LIMIT 1',
        {
            replacements: { settingKey }
        }
    );

    if (Array.isArray(rows) && rows.length > 0) {
        return;
    }

    await queryInterface.bulkInsert('system_settings', [{
        setting_key: settingKey,
        setting_value: settingValue,
        data_type: dataType,
        description,
        updated_at: new Date()
    }]);
};

module.exports = {
    async up(queryInterface, Sequelize) {
        const usersDefinition = await queryInterface.describeTable('users');
        if (usersDefinition?.role) {
            await queryInterface.changeColumn('users', 'role', {
                type: Sequelize.ENUM(...EXTENDED_USER_ROLES),
                allowNull: false,
                defaultValue: 'staff'
            });
        }

        if (!(await tableExists(queryInterface, 'pos_catalog_overrides'))) {
            await queryInterface.createTable('pos_catalog_overrides', {
                pos_catalog_override_id: {
                    type: Sequelize.INTEGER,
                    autoIncrement: true,
                    primaryKey: true
                },
                item_id: {
                    type: Sequelize.INTEGER,
                    allowNull: false,
                    unique: true,
                    references: {
                        model: 'items',
                        key: 'item_id'
                    },
                    onUpdate: 'CASCADE',
                    onDelete: 'CASCADE'
                },
                pos_visible: {
                    type: Sequelize.BOOLEAN,
                    allowNull: false,
                    defaultValue: true
                },
                pos_image_path: {
                    type: Sequelize.STRING(500),
                    allowNull: true
                },
                pos_image_url: {
                    type: Sequelize.STRING(500),
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
                    defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
                }
            });

            await queryInterface.addIndex('pos_catalog_overrides', ['item_id'], {
                unique: true,
                name: 'uq_pos_catalog_overrides_item_id'
            });
        }

        await insertSettingIfMissing(
            queryInterface,
            'pos_petty_cash_symbol',
            'PHP',
            'string',
            'POS petty cash currency symbol for cashier float and reconciliation display'
        );
        await insertSettingIfMissing(
            queryInterface,
            'pos_petty_cash_amount',
            '0',
            'number',
            'POS petty cash starting float amount used for reconciliation (operational only)'
        );
    },

    async down(queryInterface, Sequelize) {
        if (await tableExists(queryInterface, 'pos_catalog_overrides')) {
            await queryInterface.dropTable('pos_catalog_overrides');
        }

        await queryInterface.bulkDelete('system_settings', {
            setting_key: {
                [Sequelize.Op.in]: ['pos_petty_cash_symbol', 'pos_petty_cash_amount']
            }
        });

        await queryInterface.sequelize.query(
            `UPDATE users SET role = 'staff' WHERE role NOT IN (${LEGACY_USER_ROLES.map((role) => `'${role}'`).join(',')})`
        );

        const usersDefinition = await queryInterface.describeTable('users');
        if (usersDefinition?.role) {
            await queryInterface.changeColumn('users', 'role', {
                type: Sequelize.ENUM(...LEGACY_USER_ROLES),
                allowNull: false,
                defaultValue: 'staff'
            });
        }
    }
};
