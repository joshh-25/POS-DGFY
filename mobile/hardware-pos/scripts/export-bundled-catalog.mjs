import { writeFile } from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

import db from '../../../apps/dgfy-api/src/models/index.js';
import { buildVisibleWhere } from '../../../apps/dgfy-api/src/utils/softDeletePolicy.js';
import { resolveCatalogVisibility } from '../../../apps/dgfy-api/src/modules/shared/utils/catalogVisibilityPolicy.js';
import { isBarcodeScopeAllowedForSurface } from '../../../apps/dgfy-api/src/modules/shared/utils/barcodePolicy.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const round4 = (value) => Math.round((Number(value) || 0) * 10000) / 10000;

const toTitleCase = (value) => String(value || '')
    .trim()
    .split(/[_\s-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(' ');

const normalizeCategoryName = (item) => {
    const folderName = String(item?.folder?.name || item?.product_folder || '').trim();
    if (folderName) return folderName;

    const rawCategory = String(item?.category || '').trim().toLowerCase();
    if (rawCategory === 'product') return 'Products';
    if (rawCategory === 'service') return 'Services';
    if (rawCategory === 'packaging') return 'Packaging';
    if (rawCategory === 'supplies') return 'Supplies';
    if (rawCategory === 'raw_material') return 'Raw Materials';
    return toTitleCase(rawCategory || 'General');
};

const pickBarcode = (barcodes = []) => {
    const eligible = (Array.isArray(barcodes) ? barcodes : [])
        .filter((barcode) => barcode?.is_active !== false && isBarcodeScopeAllowedForSurface(barcode?.scope, 'pos'));

    if (eligible.length === 0) {
        return null;
    }

    eligible.sort((left, right) => {
        if ((left?.is_primary === true) !== (right?.is_primary === true)) {
            return left?.is_primary === true ? -1 : 1;
        }
        return Number(left?.item_barcode_id || 0) - Number(right?.item_barcode_id || 0);
    });

    return String(eligible[0]?.code || '').trim() || null;
};

const exportCatalog = async () => {
    const items = await db.Item.findAll({
        where: buildVisibleWhere({}, { statusField: 'status', excludeInactiveStatus: true }),
        attributes: [
            'item_id',
            'name',
            'category',
            'product_type',
            'product_folder',
            'default_sale_price'
        ],
        include: [
            {
                model: db.ItemFolder,
                as: 'folder',
                attributes: ['name'],
                required: false
            },
            {
                model: db.ServiceItemDetail,
                as: 'serviceDetail',
                attributes: ['visible_in_pos', 'bookable'],
                required: false
            },
            {
                model: db.PosCatalogOverride,
                as: 'posCatalogOverride',
                attributes: ['pos_visible', 'pos_image_url'],
                required: false
            },
            {
                model: db.StorefrontCatalogOverride,
                as: 'storefrontCatalogOverride',
                attributes: ['storefront_image_url'],
                required: false
            },
            {
                model: db.ItemBarcode,
                as: 'barcodes',
                attributes: ['item_barcode_id', 'code', 'scope', 'is_primary', 'is_active'],
                required: false
            }
        ],
        order: [['name', 'ASC']]
    });

    const catalog = items
        .map((row) => (typeof row.toJSON === 'function' ? row.toJSON() : row))
        .filter((item) => resolveCatalogVisibility({
            item,
            override: item?.posCatalogOverride || null,
            surface: 'pos'
        }) !== false)
        .map((item) => ({
            itemId: Number(item.item_id),
            itemName: String(item.name || '').trim(),
            categoryName: normalizeCategoryName(item),
            price: round4(item.default_sale_price),
            barcode: pickBarcode(item.barcodes),
            imageUrl: item?.posCatalogOverride?.pos_image_url || item?.storefrontCatalogOverride?.storefront_image_url || null
        }));

    const generatedAt = new Date().toISOString();
    const outputPath = path.resolve(__dirname, '../src/app/bundledCatalog.ts');
    const fileContents = `import type { CatalogProduct } from '../domain/catalog';\n\nexport const bundledCatalogGeneratedAt = ${JSON.stringify(generatedAt)};\n\nexport const bundledCatalog: CatalogProduct[] = ${JSON.stringify(catalog, null, 4)};\n`;

    await writeFile(outputPath, fileContents, 'utf8');
    console.log(`Bundled ${catalog.length} POS items into ${outputPath}`);
};

try {
    await exportCatalog();
} finally {
    await db.sequelize.close();
}
