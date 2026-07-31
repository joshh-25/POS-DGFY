import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import mysql from 'mysql2/promise';
import sharp from 'sharp';

import {
  removeOptimizedImageAsset,
  storeOptimizedImageAsset
} from '../src/modules/shared/utils/imageAssetStorage.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '..', '.env') });

const ITEM_COUNT = 100;
const TENANT_NAME = 'Masu Cafe';
const BATCH_PREFIX = 'pos-catalog-perf';
const MARKER_PREFIX = 'PERF_TEST_BATCH:';
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1']);
const CATEGORY_NAMES = ['Meals', 'Drinks', 'Desserts', 'Snacks', 'Breakfast'];

export const parseArgs = (argv = process.argv.slice(2)) => {
  const values = new Map();
  for (const argument of argv) {
    const [key, ...rest] = argument.replace(/^--/, '').split('=');
    values.set(key, rest.length ? rest.join('=') : true);
  }
  return {
    apply: values.get('apply') === true,
    cleanup: values.get('cleanup') === true,
    allowLocalMutation: values.get('allow-local-mutation') === true,
    tenantId: String(values.get('tenant-id') || '').trim(),
    batchId: String(values.get('batch-id') || '').trim()
  };
};

export const assertLocalMutationAllowed = ({ host, nodeEnv, allowLocalMutation }) => {
  if (!LOCAL_HOSTS.has(String(host || '').trim().toLowerCase())) {
    throw new Error(`Refusing catalog performance mutation against non-local DB host: ${host || '(missing)'}`);
  }
  if (String(nodeEnv || '').trim().toLowerCase() === 'production') {
    throw new Error('Refusing catalog performance mutation while NODE_ENV=production');
  }
  if (!allowLocalMutation) {
    throw new Error('Pass --allow-local-mutation after confirming this is the disposable local tenant');
  }
};

const quoteIdentifier = (value) => `\`${String(value).replace(/`/g, '``')}\``;
const markerFor = (batchId) => `${MARKER_PREFIX}${batchId}`;
const uploadsRoot = path.resolve(__dirname, '..', 'uploads');

const openLandlordConnection = () => mysql.createConnection({
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME || 'sku_inventory_manager',
  multipleStatements: false
});

const resolveTenant = async (connection, tenantId) => {
  const [rows] = await connection.query(
    'SELECT id, name, db_name, status FROM tenants WHERE id = ? AND LOWER(name) = LOWER(?) LIMIT 2',
    [tenantId, TENANT_NAME]
  );
  if (rows.length !== 1) {
    throw new Error(`Expected exactly one ${TENANT_NAME} tenant matching --tenant-id`);
  }
  if (rows[0].status !== 'active') {
    throw new Error(`${TENANT_NAME} must be active before performance data is generated`);
  }
  return rows[0];
};

const createSourceImage = async ({ tempPath, index }) => {
  const hue = (index * 37) % 360;
  const svg = `
    <svg width="1600" height="1000" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stop-color="hsl(${hue},75%,46%)"/>
          <stop offset="1" stop-color="hsl(${(hue + 55) % 360},70%,25%)"/>
        </linearGradient>
      </defs>
      <rect width="1600" height="1000" fill="url(#g)"/>
      <circle cx="800" cy="420" r="260" fill="rgba(255,255,255,.18)"/>
      <text x="800" y="470" text-anchor="middle" fill="white" font-size="150" font-family="sans-serif" font-weight="700">ITEM ${String(index).padStart(3, '0')}</text>
      <text x="800" y="650" text-anchor="middle" fill="white" font-size="54" font-family="sans-serif">LOCAL PERFORMANCE DATA</text>
    </svg>`;
  await sharp(Buffer.from(svg)).jpeg({ quality: 88, progressive: true }).toFile(tempPath);
};

const createImageAsset = async ({ tenantId, batchId, index }) => {
  const tempDir = path.join(uploadsRoot, '.performance-seed-temp');
  await fs.mkdir(tempDir, { recursive: true });
  const tempPath = path.join(tempDir, `${batchId}-${index}.jpg`);
  await createSourceImage({ tempPath, index });
  return storeOptimizedImageAsset({
    uploadsRoot,
    surfaceFolder: 'pos-catalog',
    scopeSegments: [tenantId, 'performance-test', batchId],
    assetBaseName: `item-${index}`,
    originalName: `performance-item-${index}.jpg`,
    reportedMime: 'image/jpeg',
    tempPath
  });
};

const ensureFolders = async (connection, database, batchId) => {
  const db = quoteIdentifier(database);
  const folderIds = [];
  for (const categoryName of CATEGORY_NAMES) {
    const name = `[PERF ${batchId}] ${categoryName}`.slice(0, 100);
    await connection.query(
      `INSERT INTO ${db}.item_folders (name, description, show_in_pos_filter, is_active, created_at, updated_at)
       VALUES (?, ?, 1, 1, NOW(), NOW())`,
      [name, markerFor(batchId)]
    );
    folderIds.push(Number((await connection.query('SELECT LAST_INSERT_ID() AS id'))[0][0].id));
  }
  return folderIds;
};

const seedItems = async ({ connection, tenant, batchId }) => {
  const db = quoteIdentifier(tenant.db_name);
  const generatedAssets = [];
  await connection.beginTransaction();
  try {
    const folderIds = await ensureFolders(connection, tenant.db_name, batchId);
    const [locations] = await connection.query(
      `SELECT location_id FROM ${db}.tenant_locations WHERE is_active = 1 ORDER BY is_primary_storefront DESC, location_id ASC LIMIT 1`
    );
    const locationId = locations[0]?.location_id || null;

    for (let index = 1; index <= ITEM_COUNT; index += 1) {
      const asset = await createImageAsset({ tenantId: tenant.id, batchId, index });
      generatedAssets.push(asset.path);
      const stock = index % 11 === 0 ? 0 : ((index * 7) % 95) + 5;
      const price = 45 + ((index * 13) % 420);
      const cost = Math.max(10, Math.round(price * 0.56));
      const sku = `PERF-${batchId.slice(-12)}-${String(index).padStart(3, '0')}`.slice(0, 50);
      const name = `Performance Item ${String(index).padStart(3, '0')}`;
      const description = `${markerFor(batchId)} Generated local-only catalog performance fixture.`;
      const folderId = folderIds[(index - 1) % folderIds.length];

      const [insertResult] = await connection.query(
        `INSERT INTO ${db}.items
          (sku_code, name, category, product_type, mode_item_preset, folder_id, description,
           current_stock, unit_of_measure, cost_per_unit, default_sale_price, vat_type,
           fifo_enabled, status, tracking_mode, created_at, updated_at)
         VALUES (?, ?, 'product', 'finished_goods', 'menu_item', ?, ?, ?, 'serving', ?, ?,
                 'vatable', 0, 'active', 'count_ledger', NOW(), NOW())`,
        [sku, name, folderId, description, stock, cost, price]
      );
      const itemId = Number(insertResult.insertId);
      await connection.query(
        `INSERT INTO ${db}.pos_catalog_overrides
          (item_id, pos_visible, pos_always_available, pos_best_seller_mode, pos_image_path, pos_image_url, created_at, updated_at)
         VALUES (?, 1, ?, ?, ?, ?, NOW(), NOW())`,
        [itemId, index % 17 === 0 ? 1 : 0, index % 9 === 0 ? 'force' : 'auto', asset.path, asset.url]
      );
      await connection.query(
        `INSERT INTO ${db}.storefront_catalog_overrides
          (item_id, storefront_visible, storefront_image_path, storefront_image_url, storefront_image_gallery, created_at, updated_at)
         VALUES (?, 1, ?, ?, ?, NOW(), NOW())`,
        [itemId, asset.path, asset.url, JSON.stringify([{ path: asset.path, url: asset.url, variants: asset.image_variants }])]
      );
      if (locationId) {
        await connection.query(
          `INSERT INTO ${db}.item_location_stocks
            (item_id, location_id, quantity_on_hand, created_at, updated_at)
           VALUES (?, ?, ?, NOW(), NOW())`,
          [itemId, locationId, stock]
        );
      }
    }
    await connection.commit();
    return { generatedAssets, locationId };
  } catch (error) {
    await connection.rollback();
    await Promise.allSettled(generatedAssets.map((storedPath) => (
      removeOptimizedImageAsset({ uploadsRoot, storedPath })
    )));
    throw error;
  } finally {
    await fs.rm(path.join(uploadsRoot, '.performance-seed-temp'), { recursive: true, force: true });
  }
};

const cleanupBatch = async ({ connection, tenant, batchId }) => {
  const db = quoteIdentifier(tenant.db_name);
  const marker = `${markerFor(batchId)}%`;
  const [assets] = await connection.query(
    `SELECT pco.pos_image_path
       FROM ${db}.items i
       LEFT JOIN ${db}.pos_catalog_overrides pco ON pco.item_id = i.item_id
      WHERE i.description LIKE ?`,
    [marker]
  );
  await connection.beginTransaction();
  try {
    const [result] = await connection.query(`DELETE FROM ${db}.items WHERE description LIKE ?`, [marker]);
    await connection.query(`DELETE FROM ${db}.item_folders WHERE description = ?`, [markerFor(batchId)]);
    await connection.commit();
    await Promise.allSettled(assets
      .map((row) => row.pos_image_path)
      .filter(Boolean)
      .map((storedPath) => removeOptimizedImageAsset({ uploadsRoot, storedPath })));
    return Number(result.affectedRows || 0);
  } catch (error) {
    await connection.rollback();
    throw error;
  }
};

const run = async () => {
  const args = parseArgs();
  const host = process.env.DB_HOST || 'localhost';
  const batchId = args.batchId || `${BATCH_PREFIX}-${new Date().toISOString().replace(/[:.]/g, '-')}`;
  if (!args.tenantId) throw new Error('--tenant-id is required');
  if (args.cleanup && !args.batchId) throw new Error('--batch-id is required for cleanup');

  const connection = await openLandlordConnection();
  try {
    const tenant = await resolveTenant(connection, args.tenantId);
    console.log(JSON.stringify({
      mode: args.cleanup ? 'cleanup' : args.apply ? 'apply' : 'dry-run',
      tenant: { id: tenant.id, name: tenant.name, database: tenant.db_name },
      batch_id: batchId,
      item_count: ITEM_COUNT,
      db_host: host
    }, null, 2));

    if (!args.apply && !args.cleanup) {
      console.log('Dry run only. Re-run with --apply --allow-local-mutation to generate data.');
      return;
    }
    assertLocalMutationAllowed({ host, nodeEnv: process.env.NODE_ENV, allowLocalMutation: args.allowLocalMutation });
    if (args.cleanup) {
      const deleted = await cleanupBatch({ connection, tenant, batchId });
      console.log(`Deleted ${deleted} generated items for batch ${batchId}.`);
      return;
    }
    const result = await seedItems({ connection, tenant, batchId });
    console.log(`Created ${ITEM_COUNT} local performance items for batch ${batchId}.`);
    console.log(`Cleanup: node scripts/seed-pos-catalog-performance-items.js --cleanup --allow-local-mutation --tenant-id=${tenant.id} --batch-id=${batchId}`);
    console.log(`Generated image assets: ${result.generatedAssets.length}; location: ${result.locationId || 'none'}.`);
  } finally {
    await connection.end();
  }
};

if (path.resolve(process.argv[1] || '') === __filename) {
  run().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}

