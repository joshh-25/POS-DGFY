'use strict';

const tableExists = async (queryInterface, tableName) => {
    const tables = await queryInterface.showAllTables();
    return (tables || []).some((entry) => {
        const normalized = typeof entry === 'string'
            ? entry
            : (entry?.tableName || entry?.table_name || String(entry));
        return String(normalized).toLowerCase() === String(tableName).toLowerCase();
    });
};

const hasColumn = async (queryInterface, tableName, columnName) => {
    try {
        const table = await queryInterface.describeTable(tableName);
        return Boolean(table && table[columnName]);
    } catch {
        return false;
    }
};

module.exports = {
    async up(queryInterface, Sequelize) {
        const tableName = 'pos_transactions';
        const columnName = 'cashier_id';

        if (!await tableExists(queryInterface, tableName)) return;
        if (!await hasColumn(queryInterface, tableName, columnName)) return;

        try {
            await queryInterface.changeColumn(tableName, columnName, {
                type: Sequelize.INTEGER,
                allowNull: true,
                references: {
                    model: 'users',
                    key: 'user_id'
                },
                onUpdate: 'CASCADE',
                onDelete: 'SET NULL'
            });
        } catch {
            // Fallback for MySQL variants that do not fully apply nullable changes through changeColumn.
            await queryInterface.sequelize.query(`
                ALTER TABLE \`${tableName}\`
                MODIFY COLUMN \`${columnName}\` INT NULL
            `);
        }
    },

    async down(queryInterface, Sequelize) {
        const tableName = 'pos_transactions';
        const columnName = 'cashier_id';

        if (!await tableExists(queryInterface, tableName)) return;
        if (!await hasColumn(queryInterface, tableName, columnName)) return;

        const [rows] = await queryInterface.sequelize.query(`
            SELECT COUNT(*) AS null_count
            FROM \`${tableName}\`
            WHERE \`${columnName}\` IS NULL
        `);
        const nullCount = Number(rows?.[0]?.null_count || rows?.[0]?.NULL_COUNT || 0);

        if (nullCount > 0) {
            throw new Error(
                `Cannot revert ${tableName}.${columnName} to NOT NULL while ${nullCount} rows contain NULL values`
            );
        }

        await queryInterface.changeColumn(tableName, columnName, {
            type: Sequelize.INTEGER,
            allowNull: false,
            references: {
                model: 'users',
                key: 'user_id'
            },
            onUpdate: 'CASCADE',
            onDelete: 'RESTRICT'
        });
    }
};
