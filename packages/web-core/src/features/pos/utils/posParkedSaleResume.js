import { isServiceCatalogItem } from './posCatalogAvailability.js';
import { normalizeAvailablePosDiscountRules } from './posDiscountOptions.js';

const PRICE_EPSILON = 0.0001;

const toArray = (value) => (Array.isArray(value) ? value : []);
const toPositiveNumber = (value) => {
    const normalized = Number(value);
    return Number.isFinite(normalized) && normalized > 0 ? normalized : null;
};
const normalizePromoCode = (value) => String(value || '').trim().toUpperCase();
const normalizeItemIdentity = (value) => String(value || '').trim().toLowerCase().replace(/\s+/g, ' ');
const normalizeDiscountName = (value) => String(value || '').trim().toLowerCase();
const positiveInteger = (value) => {
    const normalized = Number.parseInt(value, 10);
    return Number.isInteger(normalized) && normalized > 0 ? normalized : null;
};

export { formatParkedSaleDisplayName } from './posParkedSaleDisplay.js';

const samePrice = (left, right) => (
    Number.isFinite(Number(left))
    && Number.isFinite(Number(right))
    && Math.abs(Number(left) - Number(right)) <= PRICE_EPSILON
);

const getLineReferences = (line = {}) => [line?.line_key, line?.line_ref]
    .map((value) => String(value || '').trim())
    .filter(Boolean);

export const isParkedSaleOriginalLine = (line = {}, parkedSale = null) => {
    if (line?.parked_snapshot_line === true) return true;

    const snapshotLines = toArray(parkedSale?.snapshot?.lines);
    if (!parkedSale?.pos_parked_sale_id || snapshotLines.length === 0) return false;

    const lineReferences = new Set(getLineReferences(line));
    if (lineReferences.size > 0) {
        return snapshotLines.some((snapshotLine) => (
            getLineReferences(snapshotLine).some((reference) => lineReferences.has(reference))
        ));
    }

    const itemId = Number(line?.item_id);
    if (!Number.isInteger(itemId) || itemId <= 0) return false;
    const sameItemSnapshotLines = snapshotLines.filter((snapshotLine) => (
        Number(snapshotLine?.item_id) === itemId
    ));
    return sameItemSnapshotLines.length === 1
        && getLineReferences(sameItemSnapshotLines[0]).length === 0;
};

export const getParkedLineEditState = (line = {}, item = null, parkedSale = null) => {
    const isOriginal = isParkedSaleOriginalLine(line, parkedSale);
    const originalQuantity = toPositiveNumber(line?.parked_original_quantity ?? line?.quantity) || 0;
    if (!isOriginal) {
        return {
            isOriginal: false,
            originalQuantity: 0,
            itemMissing: false,
            priceChanged: false,
            canIncrease: true,
            currentPrice: Number(item?.default_sale_price)
        };
    }

    const itemId = Number(item?.item_id);
    const lineItemId = Number(line?.item_id);
    const itemMissing = !item
        || !Number.isInteger(itemId)
        || itemId <= 0
        || !Number.isInteger(lineItemId)
        || lineItemId !== itemId;
    const currentPrice = Number(item?.default_sale_price);
    const savedBasePrice = Number(line?.base_sale_price);
    const savedSalePrice = Number(line?.sale_price);
    const hasPriceOverrideReason = String(line?.price_override_reason || '').trim().length >= 3;
    const priceChanged = !itemMissing && (
        !Number.isFinite(currentPrice)
        || currentPrice <= 0
        || (Number.isFinite(savedBasePrice) && !samePrice(currentPrice, savedBasePrice))
        || (!hasPriceOverrideReason && Number.isFinite(savedSalePrice) && !samePrice(currentPrice, savedSalePrice))
    );

    return {
        isOriginal: true,
        originalQuantity,
        itemMissing,
        priceChanged,
        canIncrease: !itemMissing && !priceChanged,
        currentPrice
    };
};

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
    discountRules = [],
    commercialPromoConfig = [],
    modifierValidator = null,
    historicalSnapshotPolicy = 'strict'
} = {}) => {
    const snapshot = parkedSale?.snapshot && typeof parkedSale.snapshot === 'object'
        ? parkedSale.snapshot
        : {};
    const lines = getParkedSaleSnapshotLines(parkedSale);
    const catalogIndexes = buildCatalogIndexes(catalog);
    const conflicts = [];
    const warnings = [];
    const allowHistoricalSnapshot = historicalSnapshotPolicy === 'warn';
    const addCatalogDrift = (message) => {
        if (allowHistoricalSnapshot) warnings.push(message);
        else conflicts.push(message);
    };
    const availableDiscountRules = normalizeAvailablePosDiscountRules(discountRules);

    if (lines.length === 0) {
        conflicts.push('This parked sale has no cart lines to resume.');
    }

    const orderMethod = String(snapshot.order_method || '').trim();
    if (orderMethod && toArray(allowedOrderMethods).length > 0 && !allowedOrderMethods.includes(orderMethod)) {
        conflicts.push(`Order method "${orderMethod}" is no longer available in this POS workflow.`);
    }

    const selectedProfile = snapshot.discount_context?.selected_profile;
    if (selectedProfile?.name) {
        const selectedProfileName = normalizeDiscountName(selectedProfile.name);
        const migratedRule = availableDiscountRules.find(
            (rule) => normalizeDiscountName(rule?.name) === selectedProfileName
        );
        const currentProfile = toArray(discountProfiles).find(
            (profile) => normalizeDiscountName(profile?.name) === selectedProfileName
        );
        if (migratedRule) {
            if (selectedProfile.percentage != null
                && !samePrice(migratedRule.percentage, selectedProfile.percentage)) {
                conflicts.push(`Discount profile "${selectedProfile.name}" has changed and must be reviewed.`);
            } else {
                warnings.push(`Discount profile "${selectedProfile.name}" was migrated; reselect the current approved rule before checkout.`);
            }
        } else if (!currentProfile) {
            conflicts.push(`Discount profile "${selectedProfile.name}" is no longer available.`);
        } else if (
            selectedProfile.percentage != null
            && !samePrice(currentProfile.percentage, selectedProfile.percentage)
        ) {
            conflicts.push(`Discount profile "${selectedProfile.name}" has changed and must be reviewed.`);
        }
    }

    const appliedDiscount = snapshot.discount_context?.applied;
    const appliedDiscountType = String(appliedDiscount?.type || '').trim().toLowerCase();
    const isServerAuthoritativeLegacyDiscount = ['promo', 'voucher'].includes(appliedDiscountType);
    const appliedRuleId = positiveInteger(appliedDiscount?.rule_id);
    const appliedDiscountKey = String(appliedDiscount?.discount_key || '').trim().toLowerCase();
    if (appliedDiscount && (appliedRuleId || appliedDiscountKey)) {
        const currentRule = availableDiscountRules.find((rule) => (
            (appliedRuleId && Number(rule?.discount_rule_id) === appliedRuleId)
            || (appliedDiscountKey && String(rule?.discount_key || '').trim().toLowerCase() === appliedDiscountKey)
        ));
        if (!currentRule) {
            conflicts.push('The parked discount configuration is no longer enabled and approved. Reapply a current discount rule.');
        } else if (
            appliedDiscount.rate != null
            && currentRule.method === 'percentage'
            && !samePrice(currentRule.percentage, appliedDiscount.rate)
        ) {
            conflicts.push(`Discount rule "${currentRule.name}" changed after this sale was parked and must be reviewed.`);
        } else if (
            appliedDiscount.amount != null
            && currentRule.method === 'fixed'
            && !samePrice(currentRule.fixed_amount, appliedDiscount.amount)
        ) {
            conflicts.push(`Discount rule "${currentRule.name}" changed after this sale was parked and must be reviewed.`);
        }
    } else if (appliedDiscount && !isServerAuthoritativeLegacyDiscount) {
        conflicts.push('The parked discount has no configurable rule identity. Reapply a current discount rule.');
    }
    if (appliedDiscountType === 'promo' && appliedDiscount?.promo_code) {
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
            if (resolved.reason === 'ambiguous_name' || resolved.reason === 'ambiguous_sku') {
                conflicts.push(`${label} matches multiple current POS catalog items and must be reviewed.`);
            } else {
                addCatalogDrift(`${label} is no longer available in the current POS catalog; the parked snapshot will be used.`);
            }
            return;
        }

        const quantity = toPositiveNumber(line?.quantity);
        if (!quantity) {
            conflicts.push(`${label} has an invalid quantity in the parked snapshot.`);
        }

        const serviceItem = isServiceCatalogItem(item) || item?.pos_always_available === true;
        const currentStock = Number(item?.current_stock);
        if (!serviceItem && (!Number.isFinite(currentStock) || currentStock < Number(quantity || 0))) {
            addCatalogDrift(`${label} no longer has enough stock to resume this quantity; the parked snapshot will be used.`);
        }

        const currentDefaultPrice = Number(item?.default_sale_price);
        if (!Number.isFinite(currentDefaultPrice) || currentDefaultPrice <= 0) {
            addCatalogDrift(`${label} no longer has a valid POS selling price; the parked snapshot price will be honored.`);
        } else {
            const savedBasePrice = Number(line?.base_sale_price);
            const savedSalePrice = Number(line?.sale_price);
            const hasPriceOverrideReason = String(line?.price_override_reason || '').trim().length >= 3;
            if (Number.isFinite(savedBasePrice) && !samePrice(currentDefaultPrice, savedBasePrice)) {
                addCatalogDrift(`${label} selling price changed while it was parked; the saved price will be honored.`);
            }
            if (!hasPriceOverrideReason && Number.isFinite(savedSalePrice) && !samePrice(currentDefaultPrice, savedSalePrice)) {
                addCatalogDrift(`${label} has a stale selling price; the saved price will be honored.`);
            }
        }

        if (typeof modifierValidator === 'function') {
            const modifierConflict = modifierValidator({ item, line, locationId });
            if (modifierConflict) addCatalogDrift(`${label}: ${modifierConflict} The parked snapshot will be used.`);
        }
    });

    return {
        ok: conflicts.length === 0,
        conflicts,
        warnings,
        snapshot,
        lines
    };
};

export const buildResumedCartLines = ({ parkedSale, catalog = [] } = {}) => {
    const catalogIndexes = buildCatalogIndexes(catalog);
    return getParkedSaleSnapshotLines(parkedSale).map((line, index) => {
        const resolved = resolveCatalogItemForLine(line, catalogIndexes);
        const item = resolved.item || {};
        const parkedLineEditState = getParkedLineEditState({
            ...line,
            parked_snapshot_line: true
        }, resolved.item);
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
            scan_metadata: line?.scan_metadata || null,
            parked_snapshot_line: true,
            parked_original_quantity: parkedLineEditState.originalQuantity,
            parked_line_item_missing: parkedLineEditState.itemMissing,
            parked_line_price_changed: parkedLineEditState.priceChanged,
            parked_line_can_increase: parkedLineEditState.canIncrease,
            parked_line_current_price: Number.isFinite(parkedLineEditState.currentPrice)
                ? parkedLineEditState.currentPrice
                : null
        };
    });
};
