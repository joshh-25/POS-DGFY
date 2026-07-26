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
// docs/features/INVENTORY_TRACKING_MODES.md).
export const AVAILABILITY_SOURCE = Object.freeze({
    COUNTED: 'counted',
    DECLARED: 'declared',
    CAPACITY: 'capacity',
    DERIVED: 'derived'
});

// The seven Axis 4 tracking modes persisted on items.tracking_mode.
// 'external_ims' and 'recipe_derived' are reserved - not yet settable via the
// item write path (Phase 9 work) - but are named here so the resolver has a
// defined (inert) shape ready for them.
export const TRACKING_MODE = Object.freeze({
    UNTRACKED: 'untracked',
    COUNT_LEDGER: 'count_ledger',
    FULL_FIFO: 'full_fifo',
    TOGGLE: 'toggle',
    CAPACITY: 'capacity',
    EXTERNAL_IMS: 'external_ims',
    RECIPE_DERIVED: 'recipe_derived'
});

const normalizeTrackingMode = (item = {}) => {
    const raw = String(item?.tracking_mode || '').trim().toLowerCase();
    return Object.values(TRACKING_MODE).includes(raw) ? raw : null;
};

/**
 * Single interpreter for "how do we know we can sell this" (see
 * stockBearingPolicy design rule 4 / docs/features/INVENTORY_TRACKING_MODES.md).
 *
 * When item.tracking_mode is explicitly set it is authoritative. When it is
 * unset (every item that existed before this column) the descriptor falls
 * back to the legacy derivation - service category/preset, pos_always_available,
 * fifo_enabled - so pre-existing items resolve identically to before this
 * column existed. This is what lets the migration be purely additive: no
 * backfill is required for correctness, only for the narrow untracked case
 * that generalizes pos_always_available onto the Storefront (see the
 * migration's own scoped backfill).
 */
export const resolveStockBearingDescriptor = (item = {}) => {
    const isService = isStockExemptServiceItem(item);
    const trackingMode = isService ? null : normalizeTrackingMode(item);

    if (trackingMode) {
        const isToggle = trackingMode === TRACKING_MODE.TOGGLE;
        const isUntracked = trackingMode === TRACKING_MODE.UNTRACKED;
        const isCapacity = trackingMode === TRACKING_MODE.CAPACITY;
        const isDeclared = isToggle || isUntracked;
        const isMovementExempt = isDeclared || isCapacity;
        const usesFifo = trackingMode === TRACKING_MODE.FULL_FIFO;

        return Object.freeze({
            tracks_quantity: !isMovementExempt,
            uses_batches: usesFifo,
            blocks_on_shortfall: !isMovementExempt,
            emits_movements: !isMovementExempt,
            carries_cost: !isCapacity,
            valuation_participant: !isCapacity,
            availability_source: isCapacity
                ? AVAILABILITY_SOURCE.CAPACITY
                : (isDeclared ? AVAILABILITY_SOURCE.DECLARED : AVAILABILITY_SOURCE.COUNTED),
            is_toggle_available: isToggle ? item?.tracking_toggle_available !== false : null
        });
    }

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
            : (isAlwaysAvailable ? AVAILABILITY_SOURCE.DECLARED : AVAILABILITY_SOURCE.COUNTED),
        is_toggle_available: null
    });
};

// Reusable classification of *why* a line carries no stock effect, shared by
// the POS and Storefront checkout paths so the persisted stock_exempt_reason
// stays consistent across both surfaces. 'pos_always_available' is kept as
// the untracked-mode reason string for continuity with existing recorded
// data, not because the mechanism is POS-only anymore.
export const resolveStockExemptReason = (item = {}, descriptor = resolveStockBearingDescriptor(item)) => {
    if (descriptor.tracks_quantity) return null;
    if (isStockExemptServiceItem(item)) return 'service_item';
    if (descriptor.availability_source === AVAILABILITY_SOURCE.CAPACITY) return 'capacity_item';
    if (descriptor.availability_source === AVAILABILITY_SOURCE.DECLARED) {
        return normalizeTrackingMode(item) === TRACKING_MODE.TOGGLE ? 'toggle' : 'pos_always_available';
    }
    return 'pos_always_available';
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
            },
            {
                [Op.or]: [
                    { tracking_mode: { [Op.notIn]: [TRACKING_MODE.UNTRACKED, TRACKING_MODE.TOGGLE, TRACKING_MODE.CAPACITY] } },
                    { tracking_mode: null }
                ]
            }
        ]
    };
};
