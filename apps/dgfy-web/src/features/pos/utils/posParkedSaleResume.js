import { isServiceCatalogItem } from './posCatalogAvailability.js';

const PRICE_EPSILON = 0.0001;

const toArray = (value) => (Array.isArray(value) ? value : []);
const toPositiveNumber = (value) => {
    const normalized = Number(value);
    return Number.isFinite(normalized) && normalized > 0 ? normalized : null;
};
const normalizePromoCode = (value) => String(value || '').trim().toUpperCase();

export const formatParkedSaleDisplayName = (parkedSale = {}) => {
    const parkedSaleId = Number.parseInt(parkedSale?.pos_parked_sale_id, 10);
    const parkedSaleName = String(parkedSale?.snapshot?.parked_sale_name || '').trim();
    const reference = Number.isInteger(parkedSaleId) && parkedSaleId > 0
        ? `Parked Sale #${parkedSaleId}`
        : 'Parked Sale';
    return parkedSaleName ? `${parkedSaleName} · ${reference}` : reference;
};

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
    const catalogById = new Map(
        toArray(catalog)
            .map((item) => [Number(item?.item_id), item])
            .filter(([itemId]) => Number.isInteger(itemId) && itemId > 0)
    );
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
        const itemId = Number(line?.item_id);
        const item = catalogById.get(itemId);
        const label = lineLabel(line, item);
        if (!item) {
            conflicts.push(`${label} is no longer available in the current POS catalog.`);
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
    const catalogById = new Map(
        toArray(catalog)
            .map((item) => [Number(item?.item_id), item])
            .filter(([itemId]) => Number.isInteger(itemId) && itemId > 0)
    );
    return getParkedSaleSnapshotLines(parkedSale).map((line, index) => {
        const item = catalogById.get(Number(line?.item_id)) || {};
        const currentGroups = Array.isArray(item.fnbModifierGroups) ? item.fnbModifierGroups : [];
        return {
            ...line,
            line_key: line?.line_key || `resumed-line-${line?.item_id || index + 1}-${Date.now()}`,
            item_id: Number(line?.item_id),
            item_name: item.name || line?.item_name || `Item #${line?.item_id || index + 1}`,
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
