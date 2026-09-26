import { isSeniorPwdDiscountEligible, round4, toArray } from './posCheckoutTerminalUtils.js';

const normalizePositiveQuantity = (value) => {
    const quantity = Number(value);
    return Number.isFinite(quantity) && quantity > 0 ? round4(quantity) : null;
};

const normalizeSalePrice = (value) => {
    const salePrice = Number(value);
    return Number.isFinite(salePrice) && salePrice >= 0 ? round4(salePrice) : null;
};

/**
 * Rehydrates an incoming online dine-in order into the cart-line shape used by
 * the regular POS checkout shell. Prices come from the order snapshot so the
 * cashier settles the existing order rather than recalculating a new sale from
 * the current catalog.
 */
export const buildIncomingDineInCheckoutCartLines = ({ order = null, catalog = [] } = {}) => {
    const catalogById = new Map(toArray(catalog).map((item) => [Number(item?.item_id), item]));
    const orderId = Number(order?.pos_transaction_id || order?.transaction_id || order?.id) || 'unknown';
    const lines = [];

    toArray(order?.lines).forEach((line, index) => {
        const itemId = Number(line?.item_id || line?.item?.item_id);
        const item = catalogById.get(itemId) || line?.item || {};
        const quantity = normalizePositiveQuantity(line?.quantity ?? line?.qty);
        const salePrice = normalizeSalePrice(line?.sale_price ?? line?.unit_price ?? line?.unit_price_snapshot);
        if (!Number.isInteger(itemId) || itemId <= 0 || !quantity || salePrice === null) return;

        const lineId = line?.line_id || line?.id || index + 1;
        const itemName = String(
            line?.item_name_snapshot
            || line?.item?.name
            || item?.name
            || line?.name
            || `Item #${itemId}`
        ).trim();

        lines.push({
            line_key: `online-dine-in-${orderId}-${lineId}`,
            line_ref: String(lineId),
            item_id: itemId,
            item_name: itemName,
            quantity,
            base_sale_price: salePrice,
            sale_price: salePrice,
            price_override_reason: 'Existing online order price snapshot',
            unit_of_measure: line?.unit_of_measure || item?.unit_of_measure || 'pcs',
            category: line?.category || item?.category || null,
            vat_type: line?.vat_type || item?.vat_type || 'vatable',
            senior_pwd_discount_eligible: isSeniorPwdDiscountEligible(
                line?.senior_pwd_discount_eligible ?? item?.senior_pwd_discount_eligible
            ),
            course: line?.course || null,
            kitchen_station_id: line?.kitchen_station_id || null,
            fnbKitchenRoutes: Array.isArray(item?.fnbKitchenRoutes) ? item.fnbKitchenRoutes : [],
            modifier_groups: [],
            line_modifiers: [],
            service_option_ids: [],
            service_option_details: [],
            special_instructions: String(
                line?.fnb_special_instructions
                || line?.special_instructions
                || line?.notes
                || ''
            ).trim(),
            scan_metadata: null
        });
    });

    return lines;
};

export default buildIncomingDineInCheckoutCartLines;
