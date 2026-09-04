import { WORKFLOW_MODE_VALUES, DEFAULT_WORKFLOW_MODE, normalizeWorkflowMode } from './workflowModes.js';

/**
 * Single source of truth for two blocks the Store Profile materializes
 * (issue #178 Phase 11 amendment): per-mode POS terminal defaults and
 * merchant-facing terminology. Both were previously frontend-only, in
 * `frontend/src/features/settings/businessModeTemplates.js`
 * (`BUSINESS_MODE_TEMPLATE_REGISTRY`) — moved here so both the terminal UI
 * and the Store Profile builder read the same values instead of one being
 * the frontend's private copy.
 *
 * That registry's `itemDefaults`/`productDefaults` blocks are deliberately
 * NOT carried over: they have no live reader independent of
 * `MODE_ITEM_TAXONOMY`'s `resolveItemDefaultsForMode` (which the Profile
 * already covers via its `item_taxonomy` block, per
 * `resolveBusinessModeItemDefaults`'s own fallback order), so duplicating
 * them here would just be more dead surface to keep in sync.
 */
const BASE_POS_DEFAULTS = Object.freeze({
    preferred_order_method: 'takeout',
    preferred_payment_type: 'cash',
    show_online_queue: true
});

const BASE_TERMINOLOGY = Object.freeze({
    item_create_label: 'Create Item',
    product_create_label: 'Create Product',
    pos_workspace_label: 'POS Terminal'
});

const buildEntry = (posDefaultsOverrides = {}, terminologyOverrides = {}) => Object.freeze({
    pos_defaults: Object.freeze({ ...BASE_POS_DEFAULTS, ...posDefaultsOverrides }),
    terminology: Object.freeze({ ...BASE_TERMINOLOGY, ...terminologyOverrides })
});

export const POS_DEFAULTS_AND_TERMINOLOGY_REGISTRY = Object.freeze({
    retail: buildEntry(
        { preferred_order_method: 'takeout' },
        { item_create_label: 'Create Retail SKU' }
    ),
    services: buildEntry(
        { preferred_order_method: 'appointment', show_online_queue: false },
        { item_create_label: 'Create Service', product_create_label: 'Create Service Package', pos_workspace_label: 'Services POS' }
    ),
    laundry: buildEntry(
        { preferred_order_method: 'appointment', show_online_queue: false },
        { item_create_label: 'Laundry Service', product_create_label: 'Laundry Package', pos_workspace_label: 'Laundry Operations' }
    ),
    manufacturing: buildEntry(
        { preferred_order_method: 'takeout' },
        { item_create_label: 'Create Food Manufacturing Item', product_create_label: 'Create Food Product' }
    ),
    food_manufacturing: buildEntry(
        { preferred_order_method: 'takeout' },
        { item_create_label: 'Create Food Manufacturing Item', product_create_label: 'Create Food Product' }
    ),
    fnb: buildEntry(
        { preferred_order_method: 'dine_in' },
        { item_create_label: 'Create Menu Item', product_create_label: 'Create Menu Product' }
    ),
    hospitality: buildEntry(
        { preferred_order_method: 'dine_in' },
        { item_create_label: 'Create Hospitality Item' }
    ),
    healthcare: buildEntry(
        { preferred_order_method: 'takeout' },
        { item_create_label: 'Create Healthcare SKU' }
    ),
    ticketing_transport: buildEntry(
        { preferred_order_method: 'pickup' },
        { item_create_label: 'Create Ticket SKU' }
    ),
    logistics_distribution: buildEntry(
        { preferred_order_method: 'delivery' },
        { item_create_label: 'Create Logistics SKU' }
    ),
    education_institutions: buildEntry(
        { preferred_order_method: 'takeout' },
        { item_create_label: 'Create Campus SKU' }
    ),
    msme: buildEntry(
        { preferred_order_method: 'takeout', show_online_queue: true },
        { item_create_label: 'Create Item', product_create_label: 'Create Product' }
    )
});

// Guard against drift: every real workflow mode must have an entry, and vice
// versa (mirrors the pattern in capabilityModules.js's vocabulary alignment
// check).
export const POS_DEFAULTS_AND_TERMINOLOGY_VOCABULARY_ALIGNED = Object.freeze({
    modes_missing_entry: WORKFLOW_MODE_VALUES.filter(
        (mode) => !POS_DEFAULTS_AND_TERMINOLOGY_REGISTRY[mode]
    ),
    entries_outside_mode_vocabulary: Object.keys(POS_DEFAULTS_AND_TERMINOLOGY_REGISTRY).filter(
        (key) => !WORKFLOW_MODE_VALUES.includes(key)
    )
});

export const resolvePosDefaultsAndTerminology = (workflowMode) => {
    const normalizedMode = normalizeWorkflowMode(workflowMode);
    return POS_DEFAULTS_AND_TERMINOLOGY_REGISTRY[normalizedMode]
        || POS_DEFAULTS_AND_TERMINOLOGY_REGISTRY[DEFAULT_WORKFLOW_MODE];
};
