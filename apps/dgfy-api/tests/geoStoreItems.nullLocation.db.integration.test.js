import crypto from 'crypto';
import { QueryTypes, Sequelize } from 'sequelize';
import sequelize from '../src/config/database.js';
import { runMigrationsForDb } from './helpers/migratedTestDatabase.js';
import { syncTenantGeoCatalog } from '../src/modules/geoSearch/services/geoCatalogSyncService.js';
import { upsertStoreItem } from '../src/workers/geoInventoryWorker.js';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const migration = require('../../dgfy-migration-runner/migrations/20261019000004-fix-geo-store-items-null-location-unique-key.cjs');

const dbConfig = {
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    port: Number(process.env.DB_PORT || 3306)
};

const isolatedDbName = () => (
    `test_geo_store_items_${Date.now()}_${crypto.randomUUID().replace(/-/g, '').slice(0, 8)}`
);

const migrationDbName = isolatedDbName();
let migrationDb;
let migrationDbCreated = false;

const assertTestDatabase = async () => {
    const [databaseRow] = await sequelize.query('SELECT DATABASE() AS database_name', { type: QueryTypes.SELECT });
    const databaseName = String(databaseRow?.database_name || '');
    if (!/test/i.test(databaseName)) {
        throw new Error(`Refusing geo_store_items integration writes outside a test database (connected to ${databaseName || 'unknown'})`);
    }
};

describe('geo_store_items NULL-location uniqueness MySQL integration', () => {
    beforeAll(async () => {
        await assertTestDatabase();
        await sequelize.query(`CREATE DATABASE IF NOT EXISTS \`${migrationDbName}\``);
        migrationDbCreated = true;
        runMigrationsForDb(migrationDbName, {
            to: '20261019000003-create-push-diagnostics-app-settings.cjs'
        });

        migrationDb = new Sequelize(
            migrationDbName,
            dbConfig.user,
            dbConfig.password,
            {
                host: dbConfig.host,
                port: dbConfig.port,
                dialect: 'mysql',
                logging: false
            }
        );
        await migrationDb.authenticate();
    }, 180000);

    afterAll(async () => {
        if (migrationDb) await migrationDb.close();
        if (migrationDbCreated) {
            await assertTestDatabase();
            await sequelize.query(`DROP DATABASE IF EXISTS \`${migrationDbName}\``);
        }
    }, 60000);

    it('keeps the newest NULL-location row per tenant/item, preserves located rows, and rejects duplicates', async () => {
        await migrationDb.query(`
            INSERT INTO geo_items (name, normalized_name, created_at, updated_at)
            VALUES
                ('Geo uniqueness test item', 'geo-uniqueness-test-item', NOW(), NOW()),
                ('Geo uniqueness single row', 'geo-uniqueness-single-row', NOW(), NOW())
        `);
        const items = await migrationDb.query(
            `SELECT geo_item_id FROM geo_items WHERE normalized_name IN ('geo-uniqueness-test-item', 'geo-uniqueness-single-row') ORDER BY geo_item_id`,
            { type: QueryTypes.SELECT }
        );
        const itemId = items[0].geo_item_id;
        const singleRowItemId = items[1].geo_item_id;
        const tenantA = '00000000-0000-0000-0000-000000002601';
        const tenantB = '00000000-0000-0000-0000-000000002602';

        await migrationDb.query(`
            INSERT INTO geo_store_items (
                id, tenant_id, location_id, item_id, sku_code, price, quantity,
                in_stock, storefront_visible, last_updated_at, created_at, updated_at
            ) VALUES
                (101, :tenantA, NULL, :itemId, NULL, NULL, 1, 1, 1, NOW(), NOW(), NOW()),
                (102, :tenantA, NULL, :itemId, NULL, NULL, 2, 1, 1, NOW(), NOW(), NOW()),
                (103, :tenantA, NULL, :itemId, NULL, NULL, 3, 1, 1, NOW(), NOW(), NOW()),
                (104, :tenantB, NULL, :itemId, NULL, NULL, 4, 1, 1, NOW(), NOW(), NOW()),
                (105, :tenantB, NULL, :itemId, NULL, NULL, 5, 1, 1, NOW(), NOW(), NOW()),
                (106, :tenantA, 77, :itemId, NULL, NULL, 6, 1, 1, NOW(), NOW(), NOW()),
                (107, :tenantA, NULL, :singleRowItemId, NULL, NULL, 7, 1, 1, NOW(), NOW(), NOW()),
                (108, :tenantA, 0, :itemId, NULL, NULL, 8, 1, 1, NOW(), NOW(), NOW())
        `, { replacements: { tenantA, tenantB, itemId, singleRowItemId } });

        await expect(migration.up(migrationDb.getQueryInterface())).rejects.toThrow(/location_id = 0/i);
        const beforeReservedKeyCleanup = await migrationDb.query(
            'SELECT COUNT(*) AS row_count FROM geo_store_items',
            { type: QueryTypes.SELECT }
        );
        expect(Number(beforeReservedKeyCleanup[0].row_count)).toBe(8);
        await migrationDb.query('DELETE FROM geo_store_items WHERE id = 108');

        await migration.up(migrationDb.getQueryInterface());

        const tenantWideRows = await migrationDb.query(`
            SELECT tenant_id, item_id, id, location_key
            FROM geo_store_items
            WHERE location_id IS NULL
            ORDER BY tenant_id, item_id
        `, { type: QueryTypes.SELECT });
        expect(tenantWideRows).toHaveLength(3);
        expect(tenantWideRows.find((row) => row.tenant_id === tenantA && Number(row.item_id) === Number(itemId)).id).toBe(103);
        expect(tenantWideRows.find((row) => row.tenant_id === tenantB && Number(row.item_id) === Number(itemId)).id).toBe(105);
        expect(tenantWideRows.find((row) => Number(row.item_id) === Number(singleRowItemId)).id).toBe(107);
        expect(tenantWideRows.every((row) => Number(row.location_key) === 0)).toBe(true);

        const locatedRows = await migrationDb.query(`
            SELECT id, location_id
            FROM geo_store_items
            WHERE tenant_id = :tenantA AND item_id = :itemId AND location_id IS NOT NULL
        `, { replacements: { tenantA, itemId }, type: QueryTypes.SELECT });
        expect(locatedRows).toEqual([{ id: 106, location_id: 77 }]);

        await expect(migrationDb.query(`
            INSERT INTO geo_store_items (
                tenant_id, location_id, item_id, sku_code, price, quantity,
                in_stock, storefront_visible, last_updated_at, created_at, updated_at
            ) VALUES (:tenantA, NULL, :itemId, NULL, NULL, 8, 1, 1, NOW(), NOW(), NOW())
        `, { replacements: { tenantA, itemId } })).rejects.toMatchObject({
            name: 'SequelizeUniqueConstraintError',
            parent: { code: 'ER_DUP_ENTRY' }
        });

        const beforeRerunCount = await migrationDb.query(
            'SELECT COUNT(*) AS row_count FROM geo_store_items',
            { type: QueryTypes.SELECT }
        );
        await migration.up(migrationDb.getQueryInterface());
        const afterRerunCount = await migrationDb.query(
            'SELECT COUNT(*) AS row_count FROM geo_store_items',
            { type: QueryTypes.SELECT }
        );
        expect(Number(afterRerunCount[0].row_count)).toBe(Number(beforeRerunCount[0].row_count));
    });

    it('keeps repeated catalog syncs to one NULL-location row and preserves a distinct location push', async () => {
        await assertTestDatabase();

        const tenantId = crypto.randomUUID();
        const itemName = `geo store null location regression ${crypto.randomUUID()}`;
        const normalizedName = itemName.toLowerCase();
        let itemId;

        try {
            await sequelize.query(`
                INSERT INTO geo_items (name, normalized_name, created_at, updated_at)
                VALUES (:itemName, :normalizedName, NOW(), NOW())
            `, { replacements: { itemName, normalizedName } });
            const [itemRow] = await sequelize.query(
                'SELECT geo_item_id FROM geo_items WHERE normalized_name = :normalizedName LIMIT 1',
                { replacements: { normalizedName }, type: QueryTypes.SELECT }
            );
            itemId = itemRow.geo_item_id;

            await syncTenantGeoCatalog({
                tenantId,
                itemSearchSnapshot: [{ item_name: itemName, in_stock_location_ids: [77] }]
            });
            await syncTenantGeoCatalog({
                tenantId,
                itemSearchSnapshot: [{ item_name: itemName, in_stock_location_ids: [] }]
            });

            const tenantWideRows = await sequelize.query(`
                SELECT id, location_id, in_stock
                FROM geo_store_items
                WHERE tenant_id = :tenantId AND item_id = :itemId AND location_id IS NULL
            `, { replacements: { tenantId, itemId }, type: QueryTypes.SELECT });
            expect(tenantWideRows).toHaveLength(1);
            expect(tenantWideRows[0].in_stock).toBe(0);

            await upsertStoreItem({
                tenantId,
                locationId: 77,
                itemId,
                skuCode: null,
                price: null,
                quantity: 1,
                inStock: true,
                storefrontVisible: true
            });
            const allRows = await sequelize.query(`
                SELECT location_id
                FROM geo_store_items
                WHERE tenant_id = :tenantId AND item_id = :itemId
                ORDER BY location_id IS NOT NULL, location_id
            `, { replacements: { tenantId, itemId }, type: QueryTypes.SELECT });
            expect(allRows).toHaveLength(2);
            expect(allRows[0].location_id).toBeNull();
            expect(Number(allRows[1].location_id)).toBe(77);
        } finally {
            if (itemId !== undefined) {
                await sequelize.query('DELETE FROM geo_item_aliases WHERE item_id = :itemId', { replacements: { itemId } });
                await sequelize.query('DELETE FROM geo_store_items WHERE tenant_id = :tenantId AND item_id = :itemId', {
                    replacements: { tenantId, itemId }
                });
            }
            await sequelize.query('DELETE FROM geo_items WHERE normalized_name = :normalizedName', {
                replacements: { normalizedName }
            });
        }
    });
});
