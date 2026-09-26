import { isSeniorPwdDiscountEligible, round4, toArray } from './posCheckoutTerminalUtils.js';
import {
    buildKitchenStationSnapshot,
    getFnbModifierGroups,
    resolveModifierDelta
} from './posCheckoutTerminalModifiers.js';

const normalizeQuantity = (value) => {
    const quantity = Number(value);
    return Number.isFinite(quantity) && quantity > 0 ? round4(quantity) : null;
};
const normalizeModifierSelections = (snapshot) => toArray(snapshot)
    .map((modifier) => ({
        modifier_group_id: Number(modifier?.modifier_group_id),
        modifier_option_id: Number(modifier?.modifier_option_id),
        quantity: Math.min(99, Math.max(1, Number.parseInt(modifier?.quantity || 1, 10) || 1))
    }))
    .filter((modifier) => (
        Number.isInteger(modifier.modifier_group_id)
        && modifier.modifier_group_id > 0
        && Number.isInteger(modifier.modifier_option_id)
        && modifier.modifier_option_id > 0
    ));

const getLineKey = (checkId, line, index) => (
    `fnb-check-${checkId || 'unknown'}-${line?.check_line_id || index}`
);

/**
 * Converts the server-owned F&B check lines into the same cart-line shape used
 * by the regular POS catalog. The catalog remains the source of truth for the
 * current sale price and checkout metadata; the check supplies quantity,
 * modifiers, kitchen routing, and service notes.
 */
export const buildFnbCheckCartLines = ({ check = null, catalog = [] } = {}) => {
    const itemsById = new Map(toArray(catalog).map((item) => [Number(item?.item_id), item]));
    const missingItemIds = [];
    const invalidPriceItemIds = [];
    const lines = [];
    const checkId = Number(check?.check_id) || null;

    toArray(check?.lines)
        .filter((line) => line?.status !== 'voided')
        .forEach((checkLine, index) => {
            const itemId = Number(checkLine?.item_id || checkLine?.item?.item_id);
            const item = itemsById.get(itemId);
            if (!item) {
                if (Number.isInteger(itemId) && itemId > 0) missingItemIds.push(itemId);
                return;
            }

            const baseSalePrice = Number(item.default_sale_price ?? checkLine?.item?.default_sale_price);
            if (!Number.isFinite(baseSalePrice) || baseSalePrice <= 0) {
                invalidPriceItemIds.push(itemId);
                return;
            }

            const modifierGroups = getFnbModifierGroups(item);
            const lineModifiers = normalizeModifierSelections(checkLine?.modifiers_snapshot);
            const modifierLine = {
                modifier_groups: modifierGroups,
                line_modifiers: lineModifiers
            };
            const route = buildKitchenStationSnapshot(item);
            const modifierDelta = resolveModifierDelta(modifierLine, lineModifiers);
            const quantity = normalizeQuantity(checkLine?.quantity) || 1;
            const kitchenStationId = Number(
                checkLine?.kitchen_station_id
                || checkLine?.kitchenStation?.kitchen_station_id
                || route.kitchen_station_id
            ) || null;

            lines.push({
                line_key: getLineKey(checkId, checkLine, index),
                item_id: item.item_id,
                item_name: item.name || checkLine?.item?.name || 'Item',
                quantity,
                base_sale_price: round4(baseSalePrice),
                sale_price: round4(baseSalePrice + modifierDelta),
                price_override_reason: '',
                unit_of_measure: item.unit_of_measure || checkLine?.item?.unit_of_measure || 'pcs',
                category: item.category || null,
                vat_type: item.vat_type || 'vatable',
                senior_pwd_discount_eligible: isSeniorPwdDiscountEligible(item.senior_pwd_discount_eligible),
                course: checkLine?.course || route.course || 'main',
                kitchen_station_id: kitchenStationId,
                fnbKitchenRoutes: Array.isArray(item.fnbKitchenRoutes) ? item.fnbKitchenRoutes : [],
                modifier_groups: modifierGroups,
                line_modifiers: lineModifiers,
                service_option_ids: [],
                service_option_details: [],
                special_instructions: String(checkLine?.special_instructions || '').trim(),
                scan_metadata: null
            });
        });

    return {
        lines,
        missingItemIds: [...new Set(missingItemIds)],
        invalidPriceItemIds: [...new Set(invalidPriceItemIds)]
    };
};
