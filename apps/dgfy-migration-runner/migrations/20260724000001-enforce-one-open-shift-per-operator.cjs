'use strict';

const TABLE_NAME = 'pos_terminal_shifts';
const COLUMN_NAME = 'active_operator_user_id';
const INDEX_NAME = 'uq_pos_terminal_shifts_active_operator';
const CASHIER_FK_COLUMN = 'cashier_id';

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

// MySQL refuses to add a STORED generated column whose base column carries an ON UPDATE
// CASCADE/SET NULL/SET DEFAULT foreign key -- adding a stored generated column forces an
// ALGORITHM=COPY table rebuild, and that rebuild re-validates the FK against this rule,
// surfacing only as a generic "Cannot add foreign key constraint" (errno 1215). cashier_id
// carries exactly such an FK (added in 20260330000001, onUpdate: CASCADE) pointed at
// users.user_id, an AUTO_INCREMENT primary key that is never updated in place -- so CASCADE
// there is unused behavior. Resolve the FK by column (name varies per tenant database: ibfk_1,
// ibfk_2, ibfk_4, ibfk_8, ...) and relax it to RESTRICT before adding the generated column.
const findCashierForeignKey = async (queryInterface) => {
    const [rows] = await queryInterface.sequelize.query(`
        SELECT rc.CONSTRAINT_NAME AS constraintName, rc.UPDATE_RULE AS updateRule
        FROM INFORMATION_SCHEMA.REFERENTIAL_CONSTRAINTS rc
        JOIN INFORMATION_SCHEMA.KEY_COLUMN_USAGE k
            ON k.CONSTRAINT_SCHEMA = rc.CONSTRAINT_SCHEMA
           AND k.CONSTRAINT_NAME = rc.CONSTRAINT_NAME
        WHERE rc.CONSTRAINT_SCHEMA = DATABASE()
          AND rc.TABLE_NAME = '${TABLE_NAME}'
          AND k.COLUMN_NAME = '${CASHIER_FK_COLUMN}'
    `);
    return rows[0] || null;
};

const relaxCashierForeignKey = async (queryInterface) => {
    const foreignKey = await findCashierForeignKey(queryInterface);
    if (!foreignKey || String(foreignKey.updateRule).toUpperCase() === 'RESTRICT') return;

    await queryInterface.sequelize.query(`
        ALTER TABLE ${TABLE_NAME} DROP FOREIGN KEY \`${foreignKey.constraintName}\`
    `);
    await queryInterface.sequelize.query(`
        ALTER TABLE ${TABLE_NAME}
        ADD CONSTRAINT \`${foreignKey.constraintName}\`
        FOREIGN KEY (${CASHIER_FK_COLUMN}) REFERENCES users (user_id)
        ON UPDATE RESTRICT ON DELETE RESTRICT
    `);
};

const restoreCashierForeignKeyCascade = async (queryInterface) => {
    const foreignKey = await findCashierForeignKey(queryInterface);
    if (!foreignKey || String(foreignKey.updateRule).toUpperCase() === 'CASCADE') return;

    await queryInterface.sequelize.query(`
        ALTER TABLE ${TABLE_NAME} DROP FOREIGN KEY \`${foreignKey.constraintName}\`
    `);
    await queryInterface.sequelize.query(`
        ALTER TABLE ${TABLE_NAME}
        ADD CONSTRAINT \`${foreignKey.constraintName}\`
        FOREIGN KEY (${CASHIER_FK_COLUMN}) REFERENCES users (user_id)
        ON UPDATE CASCADE
    `);
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
            await relaxCashierForeignKey(queryInterface);

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
            await restoreCashierForeignKeyCascade(queryInterface);
        }
    }
};
