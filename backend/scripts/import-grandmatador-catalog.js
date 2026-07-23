import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Op } from 'sequelize';
import db from '../src/models/index.js';
import dbStore from '../src/utils/dbStore.js';
import tenantConnector from '../src/utils/TenantConnector.js';
import { getTenantModels } from '../src/utils/tenantModelFactory.js';
import { auditGrandMatadorCatalog } from '../src/modules/storefrontDomains/migration/grandMatadorCatalogAudit.js';
import { buildGrandMatadorCatalogImportPlan } from '../src/modules/storefrontDomains/migration/grandMatadorCatalogImport.js';
import {
    buildGrandMatadorReadyCatalogPages,
    GRANDMATADOR_READY_CATALOG_SOURCE
} from '../src/modules/storefrontDomains/migration/grandMatadorReadyCatalog.js';
import {
    removeOptimizedImageAsset,
    storeOptimizedImageAsset
} from '../src/modules/shared/utils/imageAssetStorage.js';
import { syncStorefrontDiscoveryIndexForTenant } from '../src/services/storefrontDiscoveryIndexService.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_ENDPOINT = 'https://api.grandmatador.com/api/v1/catalog';
const DEFAULT_TENANT_ID = '3236edf9-3f17-4a80-8c13-50874fcdb217';
const DEFAULT_LOCATION_ID = 1;
const MAX_PAGES = 100;
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

const parseArgs = (argv) => {
    const config = {
        apply: false,
        replaceImages: false,
        readyCatalog: false,
        replaceCatalog: false,
        tenantId: process.env.GRANDMATADOR_TENANT_ID || DEFAULT_TENANT_ID,
        locationId: Number(process.env.GRANDMATADOR_LOCATION_ID || DEFAULT_LOCATION_ID),
        endpoint: process.env.GRANDMATADOR_CATALOG_URL || DEFAULT_ENDPOINT,
        uploadsRoot: process.env.GRANDMATADOR_UPLOADS_ROOT || path.resolve(__dirname, '..', 'uploads')
    };

    for (let index = 0; index < argv.length; index += 1) {
        const token = argv[index];
        if (token === '--apply') config.apply = true;
        else if (token === '--replace-images') config.replaceImages = true;
        else if (token === '--ready-catalog') config.readyCatalog = true;
        else if (token === '--replace-catalog') config.replaceCatalog = true;
        else if (token === '--tenant-id') config.tenantId = argv[++index] || config.tenantId;
        else if (token === '--location-id') config.locationId = Number(argv[++index] || config.locationId);
        else if (token === '--endpoint') config.endpoint = argv[++index] || config.endpoint;
        else if (token === '--uploads-root') config.uploadsRoot = path.resolve(argv[++index] || config.uploadsRoot);
    }
    if (!Number.isInteger(config.locationId) || config.locationId <= 0) {
        throw new Error('location-id must be a positive integer.');
    }
    return config;
};

const fetchCatalogPages = async (endpoint) => {
    const pages = [];
    let nextUrl = endpoint;
    while (nextUrl) {
        if (pages.length >= MAX_PAGES) throw new Error('Catalog pagination exceeded the safety limit.');
        const response = await fetch(nextUrl, {
            headers: { Accept: 'application/json' },
            signal: AbortSignal.timeout(30_000)
        });
        if (!response.ok) throw new Error(`Catalog request failed with HTTP ${response.status}.`);
        const page = await response.json();
        pages.push(page);
        nextUrl = String(page?.products?.next_page_url || '').trim();
    }
    return pages;
};

const asPlain = (value) => value && typeof value.toJSON === 'function' ? value.toJSON() : value;

const applyCatalogRows = async ({
    tenantModels,
    tenantSequelize,
    plan,
    locationId,
    replaceCatalog
}) => {
    const {
        Item,
        ItemFolder,
        ItemLocationStock,
        StorefrontCatalogOverride,
        TenantLocation,
        FnbModifierGroup,
        FnbModifierOption,
        FnbItemModifierGroup
    } = tenantModels;
    const location = await TenantLocation.findByPk(locationId);
    if (!location || location.is_active === false) {
        throw new Error(`Active tenant location ${locationId} was not found.`);
    }

    const transaction = await tenantSequelize.transaction();
    const itemRows = [];
    const replacement = { retired_items: 0, retired_categories: 0 };
    try {
        const desiredSkus = new Set(plan.products.map((product) => product.sku_code));
        const staleFolderIds = new Set();
        if (replaceCatalog) {
            const existingCatalogItems = await Item.findAll({
                where: {
                    sku_code: { [Op.like]: 'GM-%' },
                    deleted_at: null
                },
                transaction,
                lock: transaction.LOCK.UPDATE
            });
            for (const item of existingCatalogItems) {
                if (desiredSkus.has(item.sku_code)) continue;
                await item.update({ status: 'inactive', current_stock: 0 }, { transaction });
                await ItemLocationStock.update(
                    { quantity_on_hand: 0 },
                    { where: { item_id: item.item_id }, transaction }
                );
                const [catalogOverride] = await StorefrontCatalogOverride.findOrCreate({
                    where: { item_id: item.item_id },
                    defaults: { storefront_visible: false },
                    transaction
                });
                await catalogOverride.update({ storefront_visible: false }, { transaction });
                if (item.folder_id) staleFolderIds.add(item.folder_id);
                replacement.retired_items += 1;
            }
        }

        const categoryIds = new Map();
        for (const category of plan.categories) {
            let folder = await ItemFolder.findOne({
                where: tenantSequelize.where(
                    tenantSequelize.fn('LOWER', tenantSequelize.fn('TRIM', tenantSequelize.col('name'))),
                    category.name.toLowerCase()
                ),
                transaction,
                lock: transaction.LOCK.UPDATE
            });
            if (!folder) {
                folder = await ItemFolder.create({
                    name: category.name,
                    description: category.description,
                    show_in_pos_filter: true,
                    is_active: true,
                    parent_id: null
                }, { transaction });
            } else {
                await folder.update({
                    name: category.name,
                    description: category.description,
                    show_in_pos_filter: true,
                    is_active: true,
                    deleted_at: null,
                    deleted_by: null
                }, { transaction });
            }
            categoryIds.set(category.source_id, folder.folder_id);
        }
        if (replaceCatalog && staleFolderIds.size > 0) {
            const desiredFolderIds = new Set(categoryIds.values());
            const retiredFolderIds = [...staleFolderIds].filter((folderId) => !desiredFolderIds.has(folderId));
            if (retiredFolderIds.length > 0) {
                const [retiredCategories] = await ItemFolder.update({
                    is_active: false,
                    show_in_pos_filter: false
                }, {
                    where: { folder_id: { [Op.in]: retiredFolderIds } },
                    transaction
                });
                replacement.retired_categories = retiredCategories;
            }
        }

        for (const product of plan.products) {
            const folderId = categoryIds.get(product.category_source_id);
            if (!folderId) throw new Error(`Category mapping missing for source product ${product.source_id}.`);
            const itemPayload = {
                sku_code: product.sku_code,
                name: product.name,
                category: 'product',
                product_type: 'finished_goods',
                mode_item_preset: 'menu_item',
                product_folder: product.category_name,
                folder_id: folderId,
                description: product.description,
                current_stock: product.current_stock,
                max_capacity: Math.max(product.current_stock, 100),
                unit_of_measure: product.unit_of_measure,
                cost_per_unit: 0,
                default_sale_price: product.default_sale_price,
                vat_type: 'vatable',
                fifo_enabled: false,
                status: 'active'
            };
            let item = await Item.findOne({
                where: { sku_code: product.sku_code, deleted_at: null },
                transaction,
                lock: transaction.LOCK.UPDATE
            });
            if (item) await item.update(itemPayload, { transaction });
            else item = await Item.create(itemPayload, { transaction });

            const [locationStock] = await ItemLocationStock.findOrCreate({
                where: { item_id: item.item_id, location_id: locationId },
                defaults: { quantity_on_hand: product.current_stock },
                transaction
            });
            await locationStock.update({ quantity_on_hand: product.current_stock }, { transaction });

            const [catalogOverride] = await StorefrontCatalogOverride.findOrCreate({
                where: { item_id: item.item_id },
                defaults: { storefront_visible: true },
                transaction
            });
            const catalogOverridePayload = { storefront_visible: true };
            if (replaceCatalog && product.images.length === 0) {
                Object.assign(catalogOverridePayload, {
                    storefront_image_path: null,
                    storefront_image_url: null,
                    storefront_image_gallery: []
                });
            }
            await catalogOverride.update(catalogOverridePayload, { transaction });

            const desiredGroupIds = [];
            for (const groupPayload of product.modifiers) {
                let group = await FnbModifierGroup.findOne({
                    where: { name: groupPayload.name },
                    transaction,
                    lock: transaction.LOCK.UPDATE
                });
                const groupFields = {
                    name: groupPayload.name,
                    display_name: groupPayload.display_name,
                    min_select: groupPayload.min_select,
                    max_select: groupPayload.max_select,
                    required: groupPayload.required,
                    is_active: true,
                    sort_order: groupPayload.sort_order
                };
                if (group) await group.update(groupFields, { transaction });
                else group = await FnbModifierGroup.create(groupFields, { transaction });
                await FnbModifierOption.destroy({ where: { modifier_group_id: group.modifier_group_id }, transaction });
                await FnbModifierOption.bulkCreate(groupPayload.options.map((option) => ({
                    ...option,
                    modifier_group_id: group.modifier_group_id,
                    sku_item_id: null,
                    allergen_notes: null
                })), { transaction });
                const [assignment] = await FnbItemModifierGroup.findOrCreate({
                    where: { item_id: item.item_id, modifier_group_id: group.modifier_group_id },
                    defaults: { is_required_override: null, sort_order: groupPayload.sort_order },
                    transaction
                });
                await assignment.update({ sort_order: groupPayload.sort_order, is_required_override: null }, { transaction });
                desiredGroupIds.push(group.modifier_group_id);
            }

            const staleGroups = await FnbModifierGroup.findAll({
                where: {
                    name: { [Op.like]: `[GM-${product.source_id}]%` },
                    ...(desiredGroupIds.length ? { modifier_group_id: { [Op.notIn]: desiredGroupIds } } : {})
                },
                transaction
            });
            for (const staleGroup of staleGroups) {
                await FnbItemModifierGroup.destroy({
                    where: { item_id: item.item_id, modifier_group_id: staleGroup.modifier_group_id },
                    transaction
                });
                await FnbModifierOption.destroy({ where: { modifier_group_id: staleGroup.modifier_group_id }, transaction });
                await staleGroup.destroy({ transaction });
            }

            itemRows.push({ item_id: item.item_id, product });
        }
        await transaction.commit();
        return { itemRows, replacement };
    } catch (error) {
        await transaction.rollback();
        throw error;
    }
};

const storedGalleryIsReusable = async ({ gallery, sourceUrls, uploadsRoot }) => {
    const entries = Array.isArray(gallery) ? gallery : [];
    if (entries.length !== sourceUrls.length) return false;
    for (let index = 0; index < entries.length; index += 1) {
        const entry = entries[index];
        if (entry?.source_url !== sourceUrls[index] || !entry?.path) return false;
        try {
            await fs.access(path.resolve(uploadsRoot, String(entry.path).replace(/^[/\\]+/, '')));
        } catch {
            return false;
        }
    }
    return true;
};

const downloadImageToTemp = async ({ sourceUrl, tempDir, sequence }) => {
    const response = await fetch(sourceUrl, {
        headers: { Accept: 'image/*' },
        signal: AbortSignal.timeout(30_000)
    });
    if (!response.ok) throw new Error(`Image request failed with HTTP ${response.status}: ${sourceUrl}`);
    const declaredBytes = Number(response.headers.get('content-length') || 0);
    if (declaredBytes > MAX_IMAGE_BYTES) throw new Error(`Image exceeds 10 MB: ${sourceUrl}`);
    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.length === 0 || bytes.length > MAX_IMAGE_BYTES) throw new Error(`Image size is invalid: ${sourceUrl}`);
    const urlExtension = path.extname(new URL(sourceUrl).pathname) || '.img';
    const tempPath = path.join(tempDir, `image-${sequence}${urlExtension}`);
    await fs.writeFile(tempPath, bytes);
    return {
        tempPath,
        originalName: path.basename(new URL(sourceUrl).pathname) || `image-${sequence}${urlExtension}`,
        reportedMime: String(response.headers.get('content-type') || '').split(';')[0].trim() || null
    };
};

const importImages = async ({ tenantModels, itemRows, uploadsRoot, tenantId, replaceImages }) => {
    const { StorefrontCatalogOverride } = tenantModels;
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'grandmatador-import-'));
    const summary = { imported: 0, reused: 0, products_without_images: 0, failed: [] };
    try {
        for (const { item_id: itemId, product } of itemRows) {
            const override = await StorefrontCatalogOverride.findOne({ where: { item_id: itemId } });
            const existingGallery = asPlain(override)?.storefront_image_gallery || [];
            if (product.images.length === 0) {
                summary.products_without_images += 1;
                continue;
            }
            if (!replaceImages && await storedGalleryIsReusable({
                gallery: existingGallery,
                sourceUrls: product.images,
                uploadsRoot
            })) {
                summary.reused += product.images.length;
                continue;
            }

            const nextGallery = [];
            for (let index = 0; index < product.images.length; index += 1) {
                const sourceUrl = product.images[index];
                try {
                    const downloaded = await downloadImageToTemp({ sourceUrl, tempDir, sequence: `${itemId}-${index}` });
                    const stored = await storeOptimizedImageAsset({
                        uploadsRoot,
                        surfaceFolder: 'storefront-catalog',
                        scopeSegments: [tenantId],
                        assetBaseName: `item-${itemId}-${index}`,
                        ...downloaded
                    });
                    nextGallery.push({
                        source_url: sourceUrl,
                        path: stored.path,
                        url: stored.url,
                        variants: stored.image_variants,
                        original_path: stored.original?.path || null,
                        classification: stored.classification || null,
                        is_primary: nextGallery.length === 0,
                        sort_order: nextGallery.length
                    });
                    summary.imported += 1;
                } catch (error) {
                    summary.failed.push({
                        item_id: itemId,
                        sku_code: product.sku_code,
                        source_url: sourceUrl,
                        reason: error?.message || 'Image import failed'
                    });
                }
            }
            if (nextGallery.length === 0) continue;
            const primary = nextGallery[0];
            await override.update({
                storefront_visible: true,
                storefront_image_path: primary.path,
                storefront_image_url: primary.url,
                storefront_image_gallery: nextGallery
            });

            const nextPaths = new Set(nextGallery.map((entry) => entry.path));
            const oldPaths = (Array.isArray(existingGallery) ? existingGallery : [])
                .map((entry) => entry?.path)
                .filter((storedPath) => storedPath && !nextPaths.has(storedPath));
            for (const storedPath of oldPaths) {
                await removeOptimizedImageAsset({ uploadsRoot, storedPath }).catch(() => null);
            }
        }
        return summary;
    } finally {
        await fs.rm(tempDir, { recursive: true, force: true });
    }
};

const run = async () => {
    const config = parseArgs(process.argv.slice(2));
    const pages = config.readyCatalog
        ? buildGrandMatadorReadyCatalogPages()
        : await fetchCatalogPages(config.endpoint);
    const source = config.readyCatalog ? GRANDMATADOR_READY_CATALOG_SOURCE : config.endpoint;
    const audit = auditGrandMatadorCatalog(pages, { source });
    if (!audit.import_ready) throw new Error(`Catalog audit failed: ${JSON.stringify(audit.findings)}`);
    const sourceOrigin = config.readyCatalog ? 'https://grandmatador.com' : new URL(config.endpoint).origin;
    const plan = buildGrandMatadorCatalogImportPlan(pages, { sourceOrigin });
    const report = {
        mode: config.apply ? 'apply' : 'dry-run',
        tenant_id: config.tenantId,
        location_id: config.locationId,
        uploads_root: config.uploadsRoot,
        audit,
        plan: {
            categories: plan.categories.length,
            products: plan.products.length,
            modifier_groups: plan.products.reduce((sum, product) => sum + product.modifiers.length, 0),
            modifier_options: plan.products.reduce((sum, product) => sum + product.modifiers.reduce((subtotal, group) => subtotal + group.options.length, 0), 0),
            images: plan.products.reduce((sum, product) => sum + product.images.length, 0)
        }
    };
    if (!config.apply) {
        process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
        return;
    }

    const tenant = await db.Tenant.findByPk(config.tenantId);
    if (!tenant) throw new Error(`Tenant ${config.tenantId} was not found.`);
    if (tenant.status !== 'active') throw new Error(`Tenant ${config.tenantId} is not active.`);
    const tenantSequelize = await tenantConnector.getConnection(tenant);
    const tenantModels = getTenantModels(tenantSequelize);
    const applyResult = await dbStore.run({
        ...tenantModels,
        tenantId: tenant.id,
        tenantName: tenant.name,
        tenantToken: tenant.company_token,
        sequelize: tenantSequelize
    }, async () => applyCatalogRows({
        tenantModels,
        tenantSequelize,
        plan,
        locationId: config.locationId,
        replaceCatalog: config.replaceCatalog
    }));
    const images = await importImages({
        tenantModels,
        itemRows: applyResult.itemRows,
        uploadsRoot: config.uploadsRoot,
        tenantId: tenant.id,
        replaceImages: config.replaceImages
    });
    const discovery = await syncStorefrontDiscoveryIndexForTenant({ tenantId: tenant.id });
    process.stdout.write(`${JSON.stringify({
        ...report,
        replacement: applyResult.replacement,
        images,
        discovery
    }, null, 2)}\n`);
};

try {
    await run();
} catch (error) {
    console.error('[GrandMatadorCatalogImport] Failed:', error?.stack || error?.message || error);
    process.exitCode = 1;
} finally {
    await tenantConnector.closeAll().catch(() => null);
    await db.sequelize.close().catch(() => null);
}
