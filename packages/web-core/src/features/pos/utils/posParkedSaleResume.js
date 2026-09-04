import { isServiceCatalogItem } from './posCatalogAvailability.js';

const PRICE_EPSILON = 0.0001;

const toArray = (value) => (Array.isArray(value) ? value : []);
const toPositiveNumber = (value) => {
    const normalized = Number(value);
    return Number.isFinite(normalized) && normalized > 0 ? normalized : null;
};
const normalizePromoCode = (value) => String(value || '').trim().toUpperCase();
const normalizeItemIdentity = (value) => String(value || '').trim().toLowerCase().replace(/\s+/g, ' ');

export { formatParkedSaleDisplayName } from './posParkedSaleDisplay.js';

const samePrice = (left, right) => (
    Number.isFinite(Number(left))
    && Number.isFinite(Number(right))
    && Math.abs(Number(left) - Number(right)) <= PRICE_EPSILON
);

const lineLabel = (line, item) => String(
    item?.name
    || line?.item_name
    || `Item #${line?.item_id || 'unknown'}`
).trim();

const addUniqueCatalogIdentity = (index, key, item) => {
    if (!key) return;
    if (!index.has(key)) {
        index.set(key, item);
        return;
    }
    if (index.get(key) !== item) index.set(key, null);
};

const buildCatalogIndexes = (catalog = []) => {
    const byId = new Map();
    const bySku = new Map();
    const byName = new Map();

    toArray(catalog).forEach((item) => {
        const itemId = Number(item?.item_id);
        if (!Number.isInteger(itemId) || itemId <= 0) return;
        byId.set(itemId, item);
        addUniqueCatalogIdentity(bySku, normalizeItemIdentity(item?.sku_code), item);
        addUniqueCatalogIdentity(byName, normalizeItemIdentity(item?.name), item);
    });

    return { byId, bySku, byName };
};

const resolveCatalogItemForLine = (line, indexes) => {
    const itemId = Number(line?.item_id);
    if (Number.isInteger(itemId) && itemId > 0) {
        const itemById = indexes.byId.get(itemId);
        if (itemById) return { item: itemById, resolution: 'item_id' };
    }

    const sku = normalizeItemIdentity(line?.sku_code || line?.item_sku || line?.sku);
    if (sku && indexes.bySku.has(sku)) {
        const itemBySku = indexes.bySku.get(sku);
        return itemBySku
            ? { item: itemBySku, resolution: 'sku_code' }
            : { item: null, reason: 'ambiguous_sku' };
    }

    const name = normalizeItemIdentity(line?.item_name || line?.name);
    if (name && indexes.byName.has(name)) {
        const itemByName = indexes.byName.get(name);
        return itemByName
            ? { item: itemByName, resolution: 'name' }
            : { item: null, reason: 'ambiguous_name' };
    }

    return { item: null, reason: 'missing' };
};

export const getParkedSaleCatalogLookupQueries = ({ parkedSale } = {}) => {
    const queries = new Set();

    getParkedSaleSnapshotLines(parkedSale).forEach((line) => {
        const sku = String(line?.sku_code || line?.item_sku || line?.sku || '').trim();
        const name = String(line?.item_name || line?.name || '').trim();
        const lookupValue = sku || name;
        if (lookupValue) queries.add(lookupValue);
    });

    return [...queries];
};

export const mergeParkedSaleCatalogResults = (catalog = [], lookupResults = [], parkedSale = null) => {
    const byId = new Map();
    const lines = getParkedSaleSnapshotLines(parkedSale);
    const parkedItemIds = new Set(lines
        .map((line) => Number(line?.item_id))
        .filter((itemId) => Number.isInteger(itemId) && itemId > 0));
    const parkedSkus = new Set(lines
        .map((line) => normalizeItemIdentity(line?.sku_code || line?.item_sku || line?.sku))
        .filter(Boolean));
    const parkedNames = new Set(lines
        .map((line) => normalizeItemIdentity(line?.item_name || line?.name))
        .filter(Boolean));

    toArray(catalog)
        .filter((item) => {
            if (lines.length === 0) return true;
            const itemId = Number(item?.item_id);
            const sku = normalizeItemIdentity(item?.sku_code);
            const name = normalizeItemIdentity(item?.name);
            return !parkedItemIds.has(itemId)
                && !parkedSkus.has(sku)
                && !parkedNames.has(name);
        })
        .forEach((item) => {
            const itemId = Number(item?.item_id);
            if (Number.isInteger(itemId) && itemId > 0) byId.set(itemId, item);
        });

    toArray(lookupResults).flatMap(toArray).forEach((item) => {
        const itemId = Number(item?.item_id);
        if (Number.isInteger(itemId) && itemId > 0) byId.set(itemId, item);
    });

    return [...byId.values()];
};

export const getParkedSaleSnapshotLines = (parkedSale = {}) => (
    toArray(parkedSale?.snapshot?.lines)
);

export const validateParkedSaleResume = ({
    parkedSale,
    catalog = [],
    locationId = null,
    allowedOrderMethods = [],
    discountProfiles = [],
    commercialPromoConfig = [],
    modifierValidator = null
} = {}) => {
    const snapshot = parkedSale?.snapshot && typeof parkedSale.snapshot === 'object'
        ? parkedSale.snapshot
        : {};
    const lines = getParkedSaleSnapshotLines(parkedSale);
    const catalogIndexes = buildCatalogIndexes(catalog);
    const conflicts = [];

    if (lines.length === 0) {
        conflicts.push('This parked sale has no cart lines to resume.');
    }

    const orderMethod = String(snapshot.order_method || '').trim();
    if (orderMethod && toArray(allowedOrderMethods).length > 0 && !allowedOrderMethods.includes(orderMethod)) {
        conflicts.push(`Order method "${orderMethod}" is no longer available in this POS workflow.`);
    }

    const selectedProfile = snapshot.discount_context?.selected_profile;
    if (selectedProfile?.name) {
        const currentProfile = toArray(discountProfiles).find(
            (profile) => String(profile?.name || '').trim() === String(selectedProfile.name).trim()
        );
        if (!currentProfile) {
            conflicts.push(`Discount profile "${selectedProfile.name}" is no longer available.`);
        } else if (
            selectedProfile.percentage != null
            && !samePrice(currentProfile.percentage, selectedProfile.percentage)
        ) {
            conflicts.push(`Discount profile "${selectedProfile.name}" has changed and must be reviewed.`);
        }
    }

    const appliedDiscount = snapshot.discount_context?.applied;
    if (String(appliedDiscount?.type || '').toLowerCase() === 'promo' && appliedDiscount?.promo_code) {
        const promoCode = normalizePromoCode(appliedDiscount.promo_code);
        const currentPromo = toArray(commercialPromoConfig).find(
            (promo) => normalizePromoCode(promo?.promo_code) === promoCode
        );
        const currentRate = Number(currentPromo?.discount_percent || 0);
        if (currentPromo?.active !== true || !(currentRate > 0 && currentRate <= 100)) {
            conflicts.push(`Promo code "${promoCode}" is no longer active.`);
        } else if (appliedDiscount.rate != null && !samePrice(currentRate, appliedDiscount.rate)) {
            conflicts.push(`Promo code "${promoCode}" has changed and must be reviewed.`);
        }
    }

    lines.forEach((line) => {
        const resolved = resolveCatalogItemForLine(line, catalogIndexes);
        const item = resolved.item;
        const label = lineLabel(line, item);
        if (!item) {
            conflicts.push(resolved.reason === 'ambiguous_name' || resolved.reason === 'ambiguous_sku'
                ? `${label} matches multiple current POS catalog items and must be reviewed.`
                : `${label} is no longer available in the current POS catalog.`);
            return;
        }

        const quantity = toPositiveNumber(line?.quantity);
        if (!quantity) {
            conflicts.push(`${label} has an invalid quantity in the parked snapshot.`);
        }

        const serviceItem = isServiceCatalogItem(item) || item?.pos_always_available === true;
        const currentStock = Number(item?.current_stock);
        if (!serviceItem && (!Number.isFinite(currentStock) || currentStock < Number(quantity || 0))) {
            conflicts.push(`${label} no longer has enough stock to resume this quantity.`);
        }

        const currentDefaultPrice = Number(item?.default_sale_price);
        if (!Number.isFinite(currentDefaultPrice) || currentDefaultPrice <= 0) {
            conflicts.push(`${label} no longer has a valid POS selling price.`);
        } else {
            const savedBasePrice = Number(line?.base_sale_price);
            const savedSalePrice = Number(line?.sale_price);
            const hasPriceOverrideReason = String(line?.price_override_reason || '').trim().length >= 3;
            if (Number.isFinite(savedBasePrice) && !samePrice(currentDefaultPrice, savedBasePrice)) {
                conflicts.push(`${label} selling price changed while it was parked.`);
            }
            if (!hasPriceOverrideReason && Number.isFinite(savedSalePrice) && !samePrice(currentDefaultPrice, savedSalePrice)) {
                conflicts.push(`${label} has a stale selling price and must be reviewed.`);
            }
        }

        if (typeof modifierValidator === 'function') {
            const modifierConflict = modifierValidator({ item, line, locationId });
            if (modifierConflict) conflicts.push(`${label}: ${modifierConflict}`);
        }
    });

    return {
        ok: conflicts.length === 0,
        conflicts,
        snapshot,
        lines
    };
};

export const buildResumedCartLines = ({ parkedSale, catalog = [] } = {}) => {
    const catalogIndexes = buildCatalogIndexes(catalog);
    return getParkedSaleSnapshotLines(parkedSale).map((line, index) => {
        const item = resolveCatalogItemForLine(line, catalogIndexes).item || {};
        const currentGroups = Array.isArray(item.fnbModifierGroups) ? item.fnbModifierGroups : [];
        return {
            ...line,
            line_key: line?.line_key || `resumed-line-${line?.item_id || index + 1}-${Date.now()}`,
            item_id: Number(item?.item_id ?? line?.item_id),
            item_name: item.name || line?.item_name || `Item #${line?.item_id || index + 1}`,
            sku_code: item.sku_code || line?.sku_code || null,
            quantity: Number(line?.quantity || 0),
            base_sale_price: Number(line?.base_sale_price ?? item.default_sale_price ?? 0),
            sale_price: Number(line?.sale_price ?? item.default_sale_price ?? 0),
            unit_of_measure: item.unit_of_measure || line?.unit_of_measure || null,
            category: item.category || line?.category || null,
            vat_type: item.vat_type || line?.vat_type || 'vatable',
            senior_pwd_discount_eligible: item.senior_pwd_discount_eligible === true
                || line?.senior_pwd_discount_eligible === true,
            fnbKitchenRoutes: Array.isArray(item.fnbKitchenRoutes) ? item.fnbKitchenRoutes : [],
            modifier_groups: currentGroups.length > 0 ? currentGroups : toArray(line?.modifier_groups),
            line_modifiers: toArray(line?.line_modifiers),
            service_option_ids: toArray(line?.service_option_ids),
            service_option_details: toArray(line?.service_option_details),
            special_instructions: line?.special_instructions || '',
            scan_metadata: line?.scan_metadata || null
        };
    });
};
