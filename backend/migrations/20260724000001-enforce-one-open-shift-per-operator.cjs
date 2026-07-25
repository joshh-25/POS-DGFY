'use strict';

const TABLE_NAME = 'pos_terminal_shifts';
const COLUMN_NAME = 'active_operator_user_id';
const INDEX_NAME = 'uq_pos_terminal_shifts_active_operator';

const tableExists = async (queryInterface) => {
    const tables = await queryInterface.showAllTables();
    return tables
        .map((entry) => (typeof entry === 'string' ? entry : entry?.tableName || entry?.table_name))
        .some((entry) => String(entry || '').toLowerCase() === TABLE_NAME);
};

const indexExists = async (queryInterface) => {
    const indexes = await queryInterface.showIndex(TABLE_NAME);
    return indexes.some((index) => index.name === INDEX_NAME);
};

module.exports = {
    async up(queryInterface) {
        if (!(await tableExists(queryInterface))) return;

        const [duplicates] = await queryInterface.sequelize.query(`
            SELECT cashier_id AS operator_user_id, COUNT(*) AS open_shift_count
            FROM ${TABLE_NAME}
            WHERE status = 'open'
            GROUP BY cashier_id
            HAVING COUNT(*) > 1
        `);
        if (duplicates.length > 0) {
            const operatorIds = duplicates.map((row) => row.operator_user_id).join(', ');
            throw new Error(
                `Cannot enforce one open shift per operator. Explicitly close duplicate open shifts first for user IDs: ${operatorIds}`
            );
        }

        const table = await queryInterface.describeTable(TABLE_NAME);
        if (!table[COLUMN_NAME]) {
            await queryInterface.sequelize.query(`
                ALTER TABLE ${TABLE_NAME}
                ADD COLUMN ${COLUMN_NAME} INTEGER
                GENERATED ALWAYS AS (
                    CASE WHEN status = 'open' THEN cashier_id ELSE NULL END
                ) STORED
            `);
        }

        if (!(await indexExists(queryInterface))) {
            await queryInterface.addIndex(TABLE_NAME, [COLUMN_NAME], {
                name: INDEX_NAME,
                unique: true
            });
        }
    },

    async down(queryInterface) {
        if (!(await tableExists(queryInterface))) return;

        if (await indexExists(queryInterface)) {
            await queryInterface.removeIndex(TABLE_NAME, INDEX_NAME);
        }

        const table = await queryInterface.describeTable(TABLE_NAME);
        if (table[COLUMN_NAME]) {
            await queryInterface.removeColumn(TABLE_NAME, COLUMN_NAME);
        }
    }
};
