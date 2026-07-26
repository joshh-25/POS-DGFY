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

// The four answer-sources a tracking mode can draw availability from (see
// docs/features/INVENTORY_TRACKING_MODES.md). Only 'counted', 'declared',
// and 'capacity' are derivable from today's signals; 'derived' (recipe-based
// availability) has no per-item marker yet and is reserved for the
// persisted tracking-mode column landing in a later phase.
export const AVAILABILITY_SOURCE = Object.freeze({
    COUNTED: 'counted',
    DECLARED: 'declared',
    CAPACITY: 'capacity',
    DERIVED: 'derived'
});

/**
 * Additive descriptor resolver: the intended single interpreter for "how do
 * we know we can sell this" (see stockBearingPolicy design rule 4). Existing
 * call sites are unchanged and keep using the boolean helpers above; nothing
 * consumes this resolver yet, so it introduces the shape without migrating
 * behavior. A later phase both migrates the ~30 existing call sites onto it
 * and adds the persisted tracking-mode column this resolver will eventually
 * read instead of re-deriving these fields from fifo_enabled/pos_always_available.
 *
 * Note the two exemption boundaries below are deliberately distinct, mirroring
 * a real split that already exists in the codebase: checkout's stock-effect
 * decision treats pos_always_available as exempt from stock movements
 * (posUseCases.js), but today's valuation/report queries (buildStockBearingItemWhere)
 * only exclude services, not always-available physical items. This resolver
 * names that gap rather than silently resolving it.
 */
export const resolveStockBearingDescriptor = (item = {}) => {
    const isService = isStockExemptServiceItem(item);
    const isAlwaysAvailable = item?.pos_always_available === true;
    const isMovementExempt = isService || isAlwaysAvailable;
    const usesFifo = item?.fifo_enabled === true;

    return Object.freeze({
        tracks_quantity: !isMovementExempt,
        uses_batches: !isMovementExempt && usesFifo,
        blocks_on_shortfall: !isMovementExempt,
        emits_movements: !isMovementExempt,
        carries_cost: !isService,
        valuation_participant: !isService,
        availability_source: isService
            ? AVAILABILITY_SOURCE.CAPACITY
            : (isAlwaysAvailable ? AVAILABILITY_SOURCE.DECLARED : AVAILABILITY_SOURCE.COUNTED)
    });
};

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
