import { Op } from 'sequelize';

export const normalizeItemCategory = (item = {}) => (
    String(item?.category || '').trim().toLowerCase()
);

export const normalizeModeItemPreset = (item = {}) => (
    String(item?.mode_item_preset || '').trim().toLowerCase()
);

export const isStockExemptServiceItem = (item = {}) => (
    normalizeItemCategory(item) === 'service'
    || normalizeModeItemPreset(item) === 'service'
);

export const isStockBearingItem = (item = {}) => (
    !isStockExemptServiceItem(item)
);

export const buildStockBearingItemWhere = (where = {}) => {
    const existingAnd = where[Op.and];
    const andClauses = Array.isArray(existingAnd)
        ? [...existingAnd]
        : existingAnd
            ? [existingAnd]
            : [];
    const normalizedWhere = { ...where };
    delete normalizedWhere[Op.and];

    return {
        ...normalizedWhere,
        [Op.and]: [
            ...andClauses,
            {
                [Op.or]: [
                    { category: { [Op.ne]: 'service' } },
                    { category: null }
                ]
            },
            {
                [Op.or]: [
                    { mode_item_preset: { [Op.ne]: 'service' } },
                    { mode_item_preset: null }
                ]
            }
        ]
    };
};
