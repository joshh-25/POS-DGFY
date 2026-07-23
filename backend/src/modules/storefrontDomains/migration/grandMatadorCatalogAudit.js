import { createHash } from 'node:crypto';

const asArray = (value) => Array.isArray(value) ? value : [];
const productRows = (page) => asArray(page?.products?.data || page?.products);

export const auditGrandMatadorCatalog = (pages = [], {
    source = 'https://api.grandmatador.com/api/v1/catalog'
} = {}) => {
    const categoriesById = new Map();
    const productsById = new Map();
    const findings = [];

    asArray(pages).forEach((page) => {
        asArray(page?.categories).forEach((category) => categoriesById.set(String(category.id), category));
        productRows(page).forEach((product) => productsById.set(String(product.id), product));
    });

    const categories = [...categoriesById.values()];
    const products = [...productsById.values()];
    const productSlugs = new Set();
    products.forEach((product) => {
        const slug = String(product.slug || '').trim().toLowerCase();
        if (!slug) findings.push({ severity: 'error', code: 'PRODUCT_SLUG_MISSING', source_id: product.id });
        else if (productSlugs.has(slug)) findings.push({ severity: 'error', code: 'PRODUCT_SLUG_DUPLICATE', slug });
        productSlugs.add(slug);
        if (!categoriesById.has(String(product.category_id))) {
            findings.push({ severity: 'error', code: 'CATEGORY_REFERENCE_MISSING', source_id: product.id, category_id: product.category_id });
        }
        if (!Number.isFinite(Number(product.base_price)) || Number(product.base_price) < 0) {
            findings.push({ severity: 'error', code: 'BASE_PRICE_INVALID', source_id: product.id });
        }
        asArray(product.images).forEach((image) => {
            if (String(image || '').startsWith('/')) {
                findings.push({ severity: 'warning', code: 'RELATIVE_IMAGE_REQUIRES_COPY', source_id: product.id, image });
            }
        });
    });

    categories.forEach((category) => {
        const slug = String(category.slug || '').trim();
        if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
            findings.push({ severity: 'warning', code: 'CATEGORY_SLUG_REQUIRES_NORMALIZATION', source_id: category.id, slug });
        }
    });

    const stableRows = products
        .map((product) => ({
            id: product.id,
            category_id: product.category_id,
            slug: product.slug,
            name: product.name,
            base_price: product.base_price,
            inventory_quantity: product.inventory_quantity,
            variants: asArray(product.variants),
            weight_options: asArray(product.weight_options),
            addons: asArray(product.addons),
            images: asArray(product.images)
        }))
        .sort((left, right) => String(left.id).localeCompare(String(right.id), undefined, { numeric: true }));

    const counts = {
        categories: categories.length,
        products: products.length,
        variants: products.reduce((sum, product) => sum + asArray(product.variants).length, 0),
        weight_options: products.reduce((sum, product) => sum + asArray(product.weight_options).length, 0),
        addons: products.reduce((sum, product) => sum + asArray(product.addons).length, 0),
        images: products.reduce((sum, product) => sum + asArray(product.images).length, 0)
    };

    return {
        source,
        counts,
        source_digest_sha256: createHash('sha256').update(JSON.stringify(stableRows)).digest('hex'),
        import_ready: findings.every((finding) => finding.severity !== 'error'),
        findings,
        mapping: {
            product: 'Item plus Storefront catalog metadata',
            inventory_quantity: 'opening ItemLocationStock after location selection',
            variants: 'modifier/cut options; parity mapping required before apply',
            weight_options: 'sell-unit options; parity mapping required before apply',
            addons: 'modifier options; parity mapping required before apply',
            images: 'copy into DGFY-managed storefront assets before cutover'
        }
    };
};
