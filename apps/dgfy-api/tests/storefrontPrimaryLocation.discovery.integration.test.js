import crypto from 'crypto';
import path from 'path';
import { fileURLToPath } from 'url';
import { spawnSync } from 'child_process';
import express from 'express';
import request from 'supertest';
import { DataTypes, Sequelize } from 'sequelize';
import dbStore from '../src/utils/dbStore.js';
import tenantConnector from '../src/utils/TenantConnector.js';
import { getTenantModels } from '../src/utils/tenantModelFactory.js';
import { createTenantLocationUseCase, updateTenantLocationUseCase } from '../src/modules/tenantLocations/index.js';
import { updateSettingsUseCase } from '../src/modules/settings/index.js';
import { syncStorefrontDiscoveryIndexForTenant } from '../src/services/storefrontDiscoveryIndexService.js';
import storefrontDiscoveryRouter from '../src/routes/storefrontDiscovery.js';
import { sequelize as landlordSequelize, Tenant, StorefrontDiscoveryIndex } from '../src/models/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const migrationRunnerRoot = path.join(__dirname, '..', '..', 'dgfy-migration-runner');

const dbConfig = {
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    port: Number(process.env.DB_PORT || 3306)
};

const createIsolatedDbName = () => (
    `test_storefront_primary_${Date.now()}_${crypto.randomUUID().replace(/-/g, '').slice(0, 8)}`
);

const runMigrationsForDb = (dbName) => {
    const migrationResult = spawnSync(
        process.execPath,
        [
            'node_modules/sequelize-cli/lib/sequelize',
            'db:migrate',
            '--env',
            'development',
            '--config',
            'src/config/sequelize.config.cjs',
            '--migrations-path',
            'migrations'
        ],
        {
            cwd: migrationRunnerRoot,
            encoding: 'utf8',
            env: {
                ...process.env,
                DB_NAME: dbName,
                DB_HOST: dbConfig.host,
                DB_USER: dbConfig.user,
                DB_PASSWORD: dbConfig.password,
                DB_PORT: String(dbConfig.port)
            }
        }
    );

    if (migrationResult.status !== 0) {
        throw new Error(
            `Migration failed for ${dbName}\n${migrationResult.stdout}\n${migrationResult.stderr}`
        );
    }
};

describe('storefront primary location integration', () => {
    const dbName = createIsolatedDbName();
    const tenantId = crypto.randomUUID();
    const tenantSlug = `primary-${crypto.randomUUID().slice(0, 8)}`;
    const companyToken = `cmp_${crypto.randomUUID().replace(/-/g, '').slice(0, 24)}`;
    let tenantSequelize;
    let tenantModels;

    const runInTenantContext = (callback) => dbStore.run(
        {
            ...tenantModels,
            sequelize: tenantSequelize,
            tenantId,
            tenantName: 'Primary Location Test Tenant',
            dbName
        },
        callback
    );

    const buildApp = () => {
        const app = express();
        app.use(express.json());
        app.use('/api/v1/storefront', storefrontDiscoveryRouter);
        return app;
    };

    const ensureDiscoveryIndexColumn = async (columnName, definition) => {
        const queryInterface = landlordSequelize.getQueryInterface();
        const table = await queryInterface.describeTable('storefront_discovery_index');
        if (!table[columnName]) {
            await queryInterface.addColumn('storefront_discovery_index', columnName, definition);
        }
    };

    beforeAll(async () => {
        await ensureDiscoveryIndexColumn('workflow_mode', { type: DataTypes.STRING(80), allowNull: false, defaultValue: 'food_manufacturing' });
        await ensureDiscoveryIndexColumn('storefront_cover_image_url', { type: DataTypes.STRING(500), allowNull: true });
        await ensureDiscoveryIndexColumn('storefront_profile_image_url', { type: DataTypes.STRING(500), allowNull: true });
        await ensureDiscoveryIndexColumn('storefront_tagline', { type: DataTypes.STRING(120), allowNull: true });
        await ensureDiscoveryIndexColumn('storefront_about', { type: DataTypes.STRING(1000), allowNull: true });
        await ensureDiscoveryIndexColumn('storefront_phone', { type: DataTypes.STRING(50), allowNull: true });
        await ensureDiscoveryIndexColumn('storefront_email', { type: DataTypes.STRING(120), allowNull: true });
        await ensureDiscoveryIndexColumn('storefront_hours', { type: DataTypes.STRING(120), allowNull: true });
        await ensureDiscoveryIndexColumn('storefront_why_choose_us', { type: DataTypes.JSON, allowNull: true });
        await ensureDiscoveryIndexColumn('storefront_social_links', { type: DataTypes.JSON, allowNull: true });
        await ensureDiscoveryIndexColumn('storefront_review_highlights', { type: DataTypes.JSON, allowNull: true });
        await ensureDiscoveryIndexColumn('storefront_promo', { type: DataTypes.JSON, allowNull: true });
        await ensureDiscoveryIndexColumn('storefront_ui_v2_enabled', { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false });
        await ensureDiscoveryIndexColumn('storefront_categories', { type: DataTypes.JSON, allowNull: true });
        await ensureDiscoveryIndexColumn('storefront_gallery_images', { type: DataTypes.JSON, allowNull: true });
        await ensureDiscoveryIndexColumn('storefront_delivery_partners', { type: DataTypes.JSON, allowNull: true });
        await ensureDiscoveryIndexColumn('storefront_follow_enabled', { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false });
        await ensureDiscoveryIndexColumn('storefront_share_enabled', { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false });
        await ensureDiscoveryIndexColumn('storefront_review_summary', { type: DataTypes.JSON, allowNull: true });
        await ensureDiscoveryIndexColumn('customer_access_mode', { type: DataTypes.STRING(32), allowNull: false, defaultValue: 'catalog' });
        await ensureDiscoveryIndexColumn('effective_customer_access_mode', { type: DataTypes.STRING(32), allowNull: false, defaultValue: 'transaction' });
        await ensureDiscoveryIndexColumn('max_customer_access_mode', { type: DataTypes.STRING(32), allowNull: false, defaultValue: 'catalog' });
        await ensureDiscoveryIndexColumn('inventory_display_mode', { type: DataTypes.STRING(32), allowNull: false, defaultValue: 'availability' });
        await ensureDiscoveryIndexColumn('inventory_low_stock_display_threshold', { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, defaultValue: 5 });
        await ensureDiscoveryIndexColumn('access_capabilities', { type: DataTypes.JSON, allowNull: true });
        await ensureDiscoveryIndexColumn('access_limitation_reason', { type: DataTypes.STRING(255), allowNull: true });
        await ensureDiscoveryIndexColumn('customer_access_modes_enabled', { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false });
        await ensureDiscoveryIndexColumn('active_location_snapshot', { type: DataTypes.JSON, allowNull: true });
        await ensureDiscoveryIndexColumn('item_search_snapshot', { type: DataTypes.JSON, allowNull: true });
        await ensureDiscoveryIndexColumn('search_snapshot_version', { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, defaultValue: 1 });
        await landlordSequelize.query(`CREATE DATABASE IF NOT EXISTS \`${dbName}\``);
        runMigrationsForDb(dbName);

        tenantSequelize = new Sequelize(
            dbName,
            dbConfig.user,
            dbConfig.password,
            {
                host: dbConfig.host,
                port: dbConfig.port,
                dialect: 'mysql',
                logging: false
            }
        );
        await tenantSequelize.authenticate();
        tenantModels = getTenantModels(tenantSequelize);

        await Tenant.create({
            id: tenantId,
            name: 'Primary Location Test Tenant',
            db_name: dbName,
            company_token: companyToken,
            status: 'active',
            plan: 'standard',
            subscription_status: 'active'
        });
    }, 180000);

    afterAll(async () => {
        await StorefrontDiscoveryIndex.destroy({ where: { tenant_id: tenantId } });
        await Tenant.destroy({ where: { id: tenantId }, force: true });
        await tenantConnector.closeAll();
        if (tenantSequelize) {
            await tenantSequelize.close();
        }
        await landlordSequelize.query(`DROP DATABASE IF EXISTS \`${dbName}\``);
    }, 60000);

    it('keeps discovery pin aligned with explicit primary location selected in admin settings flow', async () => {
        const firstLocation = await runInTenantContext(() => createTenantLocationUseCase({
            payload: {
                name: 'Main Branch',
                address_line: 'Rizal Street, Iloilo City',
                latitude: 10.7202,
                longitude: 122.5621,
                delivery_radius_km: 5,
                is_open: true,
                is_active: true
            }
        }));
        expect(firstLocation.success).toBe(true);
        expect(firstLocation.data.is_primary_storefront).toBe(true);

        const secondLocation = await runInTenantContext(() => createTenantLocationUseCase({
            payload: {
                name: 'Branch 2',
                address_line: 'Lapaz, Iloilo City',
                latitude: 10.708,
                longitude: 122.559,
                delivery_radius_km: 6,
                is_open: true,
                is_active: true
            }
        }));
        expect(secondLocation.success).toBe(true);
        expect(secondLocation.data.is_primary_storefront).toBe(false);

        const settingsResult = await runInTenantContext(() => updateSettingsUseCase({
            settingsData: {
                store_tenant_slug: tenantSlug,
                store_is_visible: true,
                storefront_cover_image_url: '/uploads/storefront-assets/test/cover.png',
                storefront_profile_image_url: '/uploads/storefront-assets/test/profile.png'
            }
        }));
        expect(settingsResult.success).toBe(true);

        const firstSync = await syncStorefrontDiscoveryIndexForTenant({ tenantId });
        expect(firstSync.status).toBe('upserted');
        expect(Number(firstSync.locationId)).toBe(Number(firstLocation.data.location_id));

        const app = buildApp();
        const initialProfile = await request(app)
            .get(`/api/v1/storefront/discovery/${tenantSlug}`);

        expect(initialProfile.status).toBe(200);
        expect(initialProfile.body.success).toBe(true);
        expect(Number(initialProfile.body.data.location_id)).toBe(Number(firstLocation.data.location_id));
        expect(initialProfile.body.data.storefront_cover_image_url).toBe('/uploads/storefront-assets/test/cover.png');
        expect(initialProfile.body.data.storefront_profile_image_url).toBe('/uploads/storefront-assets/test/profile.png');

        const promoteSecondLocation = await runInTenantContext(() => updateTenantLocationUseCase({
            locationId: secondLocation.data.location_id,
            payload: {
                is_primary_storefront: true,
                last_known_updated_at: secondLocation.data.updated_at
            }
        }));
        expect(promoteSecondLocation.success).toBe(true);
        expect(promoteSecondLocation.data.is_primary_storefront).toBe(true);

        const postPromoteRows = await runInTenantContext(() => tenantModels.TenantLocation.findAll({
            order: [['location_id', 'ASC']]
        }));
        const firstRow = postPromoteRows.find((row) => Number(row.location_id) === Number(firstLocation.data.location_id));
        const secondRow = postPromoteRows.find((row) => Number(row.location_id) === Number(secondLocation.data.location_id));
        expect(firstRow?.is_primary_storefront).toBe(false);
        expect(secondRow?.is_primary_storefront).toBe(true);

        const secondSync = await syncStorefrontDiscoveryIndexForTenant({ tenantId });
        expect(secondSync.status).toBe('upserted');
        expect(Number(secondSync.locationId)).toBe(Number(secondLocation.data.location_id));
        expect(secondSync.usedFallbackPrimary).toBe(false);

        const connectorSequelize = await tenantConnector.getConnection({
            id: tenantId,
            name: 'Primary Location Test Tenant',
            db_name: dbName
        });
        const [connectorRows] = await connectorSequelize.query(
            'SELECT location_id, is_primary_storefront, is_active FROM tenant_locations ORDER BY location_id ASC'
        );
        const connectorFirst = connectorRows.find((row) => Number(row.location_id) === Number(firstLocation.data.location_id));
        const connectorSecond = connectorRows.find((row) => Number(row.location_id) === Number(secondLocation.data.location_id));
        expect(Number(connectorFirst?.is_primary_storefront)).toBe(0);
        expect(Number(connectorSecond?.is_primary_storefront)).toBe(1);

        const landlordIndexRow = await StorefrontDiscoveryIndex.findOne({
            where: { tenant_id: tenantId }
        });
        expect(Number(landlordIndexRow.location_id)).toBe(Number(secondLocation.data.location_id));

        const updatedProfile = await request(app)
            .get(`/api/v1/storefront/discovery/${tenantSlug}`);

        expect(updatedProfile.status).toBe(200);
        expect(updatedProfile.body.success).toBe(true);
        expect(Number(updatedProfile.body.data.location_id)).toBe(Number(secondLocation.data.location_id));
        expect(updatedProfile.body.data.location_name).toBe('Branch 2');
        expect(updatedProfile.body.data.storefront_cover_image_url).toBe('/uploads/storefront-assets/test/cover.png');
        expect(updatedProfile.body.data.storefront_profile_image_url).toBe('/uploads/storefront-assets/test/profile.png');

        const discoveryList = await request(app)
            .get('/api/v1/storefront/discovery');
        expect(discoveryList.status).toBe(200);
        const alphaRow = Array.isArray(discoveryList.body?.data?.stores)
            ? discoveryList.body.data.stores.find((row) => String(row.slug || '') === tenantSlug)
            : null;
        expect(alphaRow).toBeTruthy();
        expect(alphaRow.storefront_cover_image_url).toBe('/uploads/storefront-assets/test/cover.png');
        expect(alphaRow.storefront_profile_image_url).toBe('/uploads/storefront-assets/test/profile.png');
    });
});
