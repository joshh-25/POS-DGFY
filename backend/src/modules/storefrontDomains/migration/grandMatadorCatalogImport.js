const asArray = (value) => Array.isArray(value) ? value : [];
const productRows = (page) => asArray(page?.products?.data || page?.products);
const round4 = (value) => Math.round((Number(value) || 0) * 10000) / 10000;

const normalizeSourceImageUrl = (value, sourceOrigin) => {
    const raw = String(value || '').trim();
    if (!raw) return null;
    return new URL(raw, sourceOrigin).toString();
};

const formatWeightName = (grams) => {
    const numericGrams = Number(grams);
    if (Number.isFinite(numericGrams) && numericGrams >= 1000 && numericGrams % 1000 === 0) {
        return `${numericGrams / 1000} kg`;
    }
    return `${numericGrams} g`;
};

const buildWeightGroup = ({ product, basePrice, defaultPrice }) => {
    const weights = asArray(product.weight_options).filter((entry) => Number(entry?.grams) > 0);
    if (weights.length === 0) return null;

    return {
        key: 'weight',
        name: `[GM-${product.id}] Weight`,
        display_name: 'Weight',
        min_select: 1,
        max_select: 1,
        required: true,
        sort_order: 0,
        options: weights.map((entry, index) => ({
            name: formatWeightName(entry.grams),
            price_delta: round4((basePrice * Number(entry.price_multiplier || 0)) - defaultPrice),
            is_default: entry.is_default === true,
            is_active: true,
            sort_order: index
        }))
    };
};

const buildSingleSelectGroup = ({ product, entries, key, displayName, sortOrder }) => {
    const activeEntries = asArray(entries).filter((entry) => entry?.is_active !== false && String(entry?.name || '').trim());
    if (activeEntries.length === 0) return null;
    return {
        key,
        name: `[GM-${product.id}] ${displayName}`,
        display_name: displayName,
        min_select: 1,
        max_select: 1,
        required: true,
        sort_order: sortOrder,
        options: activeEntries.map((entry, index) => ({
            name: String(entry.name).trim(),
            price_delta: round4(entry.price_adjustment),
            is_default: index === 0,
            is_active: true,
            sort_order: index
        }))
    };
};

const buildAddOnGroup = ({ product, sortOrder }) => {
    const entries = asArray(product.addons).filter((entry) => entry?.is_active !== false && String(entry?.name || '').trim());
    if (entries.length === 0) return null;
    return {
        key: 'addons',
        name: `[GM-${product.id}] Add-ons`,
        display_name: 'Add-ons',
        min_select: 0,
        max_select: entries.length,
        required: false,
        sort_order: sortOrder,
        options: entries.map((entry, index) => ({
            name: String(entry.name).trim(),
            price_delta: round4(entry.price_adjustment),
            is_default: false,
            is_active: true,
            sort_order: index
        }))
    };
};

export const buildGrandMatadorCatalogImportPlan = (pages = [], {
    sourceOrigin = 'https://api.grandmatador.com'
} = {}) => {
    const categoryById = new Map();
    const productById = new Map();

    asArray(pages).forEach((page) => {
        asArray(page?.categories).forEach((category) => categoryById.set(String(category.id), category));
        productRows(page).forEach((product) => productById.set(String(product.id), product));
    });

    const categories = [...categoryById.values()]
        .filter((category) => category?.is_active !== false)
        .sort((left, right) => (Number(left.sort_order) || 0) - (Number(right.sort_order) || 0))
        .map((category) => ({
            source_id: String(category.id),
            name: String(category.name || '').trim().replace(/\s+/g, ' '),
            description: `Imported from Grand Matador category ${category.slug || category.id}.`
        }));

    const products = [...productById.values()]
        .filter((product) => product?.is_active !== false)
        .sort((left, right) => Number(left.id) - Number(right.id))
        .map((product) => {
            const basePrice = round4(product.base_price);
            const weights = asArray(product.weight_options).filter((entry) => Number(entry?.grams) > 0);
            const defaultWeight = weights.find((entry) => entry?.is_default === true) || weights[0] || null;
            const defaultPrice = defaultWeight
                ? round4(basePrice * Number(defaultWeight.price_multiplier || 0))
                : basePrice;
            const modifiers = [
                buildWeightGroup({ product, basePrice, defaultPrice }),
                buildSingleSelectGroup({
                    product,
                    entries: product.variants,
                    key: 'cut',
                    displayName: 'Cut',
                    sortOrder: 1
                }),
                buildAddOnGroup({ product, sortOrder: 2 })
            ].filter(Boolean);

            return {
                source_id: String(product.id),
                source_slug: String(product.slug || '').trim(),
                sku_code: `GM-${String(product.id).padStart(4, '0')}`,
                name: String(product.name || '').trim(),
                description: String(product.description || '').trim(),
                category_source_id: String(product.category_id),
                category_name: categoryById.get(String(product.category_id))?.name?.trim().replace(/\s+/g, ' ') || null,
                default_sale_price: defaultPrice,
                source_base_price: basePrice,
                current_stock: Math.max(0, Number(product.inventory_quantity) || 0),
                unit_of_measure: String(product.pricing_unit || 'kg').trim() || 'kg',
                is_featured: product.is_featured === true,
                images: asArray(product.images)
                    .map((image) => normalizeSourceImageUrl(image, sourceOrigin))
                    .filter(Boolean),
                modifiers
            };
        });

    return { categories, products };
};
