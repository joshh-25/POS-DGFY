import { WORKFLOW_MODE_VALUES, DEFAULT_WORKFLOW_MODE, normalizeWorkflowMode } from './workflowModes.js';

/**
 * Phase 138 (#820) -- ADR 0069 clause 5 asks for a typed per-tenant settings table; #820's own
 * scope explicitly names posDefaultsAndTerminology.js's registry pattern as the one to follow for
 * "per-vertical defaults". Mirrored structurally here (buildEntry merge, drift guard, resolver) --
 * but every entry's *value* is intentionally identical today. Nothing in ADR 0069 or #820
 * specifies actual per-vertical divergence yet, and ADR 0069 clause 6 scopes real usage to Retail
 * only regardless (a non-Retail tenant's payment_mode is rejected back to full_payment server-side,
 * see downpaymentSettingsUseCases.js). This is future-ready plumbing for when that changes, not
 * business logic invented for this phase -- the landlord repository's own DEFAULT_SETTINGS fallback
 * stays a flat, non-vertical-aware object (it has no tenant-DB workflow_mode visibility without
 * extra plumbing this phase doesn't need); this registry is exported for a later phase or the admin
 * frontend to consume instead.
 */
const BASE_DOWNPAYMENT_DEFAULTS = Object.freeze({
    payment_mode: 'full_payment',
    downpayment_type: null,
    downpayment_rate_bps: null,
    downpayment_fixed_centavos: null,
    min_downpayment_centavos: 0,
    downpayment_refundable: true,
    allowed_capture_methods: null
});

const buildEntry = (overrides = {}) => Object.freeze({ ...BASE_DOWNPAYMENT_DEFAULTS, ...overrides });

export const DOWNPAYMENT_DEFAULTS_REGISTRY = Object.freeze({
    retail: buildEntry(),
    services: buildEntry(),
    laundry: buildEntry(),
    manufacturing: buildEntry(),
    food_manufacturing: buildEntry(),
    fnb: buildEntry(),
    hospitality: buildEntry(),
    healthcare: buildEntry(),
    ticketing_transport: buildEntry(),
    logistics_distribution: buildEntry(),
    education_institutions: buildEntry(),
    msme: buildEntry()
});

// Guard against drift: every real workflow mode must have an entry, and vice versa -- mirrors
// posDefaultsAndTerminology.js's own POS_DEFAULTS_AND_TERMINOLOGY_VOCABULARY_ALIGNED check.
export const DOWNPAYMENT_DEFAULTS_VOCABULARY_ALIGNED = Object.freeze({
    modes_missing_entry: WORKFLOW_MODE_VALUES.filter(
        (mode) => !DOWNPAYMENT_DEFAULTS_REGISTRY[mode]
    ),
    entries_outside_mode_vocabulary: Object.keys(DOWNPAYMENT_DEFAULTS_REGISTRY).filter(
        (key) => !WORKFLOW_MODE_VALUES.includes(key)
    )
});

export const resolveDownpaymentDefaultsForMode = (workflowMode) => {
    const normalizedMode = normalizeWorkflowMode(workflowMode);
    return DOWNPAYMENT_DEFAULTS_REGISTRY[normalizedMode]
        || DOWNPAYMENT_DEFAULTS_REGISTRY[DEFAULT_WORKFLOW_MODE];
};
