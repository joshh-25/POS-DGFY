import { round4, toArray } from './posCheckoutTerminalUtils.js';

export const getFnbModifierGroups = (item = {}) => (
    Array.isArray(item?.fnbModifierGroups) ? item.fnbModifierGroups : []
);

export const getActiveModifierOptions = (group = {}) => (
    toArray(group?.options).filter((option) => option?.is_active !== false)
);

export const getModifierGroupMin = (group = {}) => {
    const through = group?.FnbItemModifierGroup || group?.fnbItemModifierGroup || {};
    const required = through.is_required_override == null ? group?.required === true : through.is_required_override === true;
    const min = Number.parseInt(group?.min_select || 0, 10) || 0;
    return required ? Math.max(1, min) : 0;
};

export const buildDefaultLineModifiers = (item = {}) => getFnbModifierGroups(item).flatMap((group) => {
    const minSelect = getModifierGroupMin(group);
    if (minSelect <= 0) return [];
    const activeOptions = getActiveModifierOptions(group);
    const defaultOptions = activeOptions.filter((option) => option?.is_default === true);
    const selected = (defaultOptions.length > 0 ? defaultOptions : activeOptions).slice(0, minSelect);
    return selected.map((option) => ({
        modifier_group_id: Number(group.modifier_group_id),
        modifier_option_id: Number(option.modifier_option_id)
    }));
});

export const resolveModifierSnapshot = (line = {}, modifiers = line.line_modifiers || []) => {
    const groups = toArray(line?.modifier_groups);
    return toArray(modifiers).map((modifier) => {
        const group = groups.find((entry) => Number(entry.modifier_group_id) === Number(modifier.modifier_group_id));
        const option = getActiveModifierOptions(group).find((entry) => Number(entry.modifier_option_id) === Number(modifier.modifier_option_id));
        if (!group || !option) return null;
        return {
            modifier_group_id: Number(group.modifier_group_id),
            modifier_option_id: Number(option.modifier_option_id),
            group_name: group.display_name || group.name || null,
            option_name: option.name || null,
            price_delta: round4(option.price_delta || 0),
            quantity: Math.min(99, Math.max(1, Number.parseInt(modifier.quantity || 1, 10) || 1))
        };
    }).filter(Boolean);
};

export const resolveModifierDelta = (line = {}, modifiers = line.line_modifiers || []) => (
    resolveModifierSnapshot(line, modifiers).reduce((sum, modifier) => round4(sum + (Number(modifier.price_delta || 0) * Number(modifier.quantity || 1))), 0)
);

export const buildKitchenStationSnapshot = (item = {}) => {
    const route = toArray(item?.fnbKitchenRoutes).find((entry) => entry?.is_primary !== false);
    return {
        kitchen_station_id: route?.kitchen_station_id || null,
        course: route?.default_course || null
    };
};
