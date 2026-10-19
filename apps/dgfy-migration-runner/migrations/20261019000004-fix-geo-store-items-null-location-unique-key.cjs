'use strict';

const TABLE_NAME = 'geo_store_items';
const LOCATION_KEY_COLUMN = 'location_key';
const OLD_UNIQUE_INDEX = 'uk_geo_store_items_tenant_loc_item';
const NEW_UNIQUE_INDEX = 'uk_geo_store_items_tenant_loc_key_item';

const tableNameOf = (table) => {
    if (typeof table === 'string') return table;
    if (!table || typeof table !== 'object') return '';
    return table.tableName || table.TABLE_NAME || Object.values(table)[0] || '';
};

const tableExists = async (queryInterface) => {
    const tables = await queryInterface.showAllTables();
    return tables.some((table) => String(tableNameOf(table)).toLowerCase() === TABLE_NAME);
};

const indexExists = (indexes, name) => indexes.some((index) => index.name === name);

const assertReservedLocationKeyIsUnused = async (queryInterface) => {
    const [rows] = await queryInterface.sequelize.query(`
        SELECT COUNT(*) AS zero_location_count
        FROM ${TABLE_NAME}
        WHERE location_id = 0
    `);
    const zeroLocationCount = Number(rows[0]?.zero_location_count || 0);
    if (zeroLocationCount > 0) {
        throw new Error(
            `Cannot reserve location_key 0 for NULL locations: found ${zeroLocationCount} geo_store_items row(s) with location_id = 0`
        );
    }
};

const deleteSupersededTenantWideRows = async (queryInterface) => {
    const [duplicateGroups] = await queryInterface.sequelize.query(`
        SELECT tenant_id, item_id, MAX(id) AS keep_id
        FROM ${TABLE_NAME}
        WHERE location_id IS NULL
        GROUP BY tenant_id, item_id
        HAVING COUNT(*) > 1
    `);

    for (const group of duplicateGroups) {
        await queryInterface.sequelize.query(`
            DELETE FROM ${TABLE_NAME}
            WHERE tenant_id = :tenantId
              AND item_id = :itemId
              AND location_id IS NULL
              AND id < :keepId
        `, {
            replacements: {
                tenantId: group.tenant_id,
                itemId: group.item_id,
                keepId: group.keep_id
            }
        });
    }
};

module.exports = {
    async up(queryInterface) {
        if (!(await tableExists(queryInterface))) return;

        // Stop before deleting any snapshots if a legacy zero location would collide with
        // the generated-key value reserved for tenant-wide NULL locations.
        await assertReservedLocationKeyIsUnused(queryInterface);

        // These rows are derived discovery snapshots. Delete duplicates in per-key statements,
        // preserving the newest snapshot (highest id) and every row with a real location_id.
        await deleteSupersededTenantWideRows(queryInterface);

        let columns = await queryInterface.describeTable(TABLE_NAME);
        if (!columns[LOCATION_KEY_COLUMN]) {
            // Location IDs are positive (tenant_locations is auto-incremented from 1), so 0
            // is reserved for the tenant-wide NULL scope without changing location_id itself.
            await queryInterface.sequelize.query(`
                ALTER TABLE ${TABLE_NAME}
                ADD COLUMN ${LOCATION_KEY_COLUMN} BIGINT UNSIGNED
                GENERATED ALWAYS AS (IFNULL(location_id, 0)) STORED NOT NULL
            `);
            columns = await queryInterface.describeTable(TABLE_NAME);
        }

        let indexes = await queryInterface.showIndex(TABLE_NAME);
        if (!indexExists(indexes, NEW_UNIQUE_INDEX)) {
            await queryInterface.addIndex(TABLE_NAME, ['tenant_id', LOCATION_KEY_COLUMN, 'item_id'], {
                name: NEW_UNIQUE_INDEX,
                unique: true
            });
            indexes = await queryInterface.showIndex(TABLE_NAME);
        }

        if (!indexExists(indexes, NEW_UNIQUE_INDEX)) {
            throw new Error(`Expected ${NEW_UNIQUE_INDEX} to exist before removing ${OLD_UNIQUE_INDEX}`);
        }

        if (indexExists(indexes, OLD_UNIQUE_INDEX)) {
            await queryInterface.removeIndex(TABLE_NAME, OLD_UNIQUE_INDEX);
        }
    },

    async down(queryInterface) {
        if (!(await tableExists(queryInterface))) return;

        let indexes = await queryInterface.showIndex(TABLE_NAME);
        if (indexExists(indexes, NEW_UNIQUE_INDEX)) {
            await queryInterface.removeIndex(TABLE_NAME, NEW_UNIQUE_INDEX);
        }

        const columns = await queryInterface.describeTable(TABLE_NAME);
        if (columns[LOCATION_KEY_COLUMN]) {
            await queryInterface.removeColumn(TABLE_NAME, LOCATION_KEY_COLUMN);
        }

        indexes = await queryInterface.showIndex(TABLE_NAME);
        if (!indexExists(indexes, OLD_UNIQUE_INDEX)) {
            await queryInterface.addIndex(TABLE_NAME, ['tenant_id', 'location_id', 'item_id'], {
                name: OLD_UNIQUE_INDEX,
                unique: true
            });
        }

        // Deleted duplicate snapshots cannot be restored by down; the next catalog sweep
        // regenerates current tenant-wide rows.
    }
};
