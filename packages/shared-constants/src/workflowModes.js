export const DEFAULT_WORKFLOW_MODE = 'food_manufacturing';

// Returned by normalizeWorkflowMode for a non-empty value that isn't a
// recognized mode (corrupted setting, decommissioned mode name, typo) so
// that garbage input resolves to the platform's minimal-capability tier
// instead of silently granting food_manufacturing's full production and
// inventory capability set. An empty/missing value is a distinct case and
// still resolves to DEFAULT_WORKFLOW_MODE, unchanged.
export const UNKNOWN_WORKFLOW_MODE_FALLBACK = 'msme';

export const WORKFLOW_MODE_VALUES = Object.freeze([
    'retail',
    'services',
    'manufacturing',
    'food_manufacturing',
    'fnb',
    'hospitality',
    'healthcare',
    'ticketing_transport',
    'logistics_distribution',
    'education_institutions',
    'msme'
]);

export const WORKFLOW_MODE_LABELS = Object.freeze({
    retail: 'Retail',
    services: 'Services',
    manufacturing: 'Food Manufacturing',
    food_manufacturing: 'Food Manufacturing',
    fnb: 'Food & Beverage',
    hospitality: 'Hospitality',
    healthcare: 'Healthcare',
    ticketing_transport: 'Ticketing & Transport',
    logistics_distribution: 'Logistics & Distribution',
    education_institutions: 'Education & Institutions',
    msme: 'Simple (MSME)'
});

export const WORKFLOW_MODE_ALIASES = Object.freeze({
    manufacturing: 'food_manufacturing'
});

const WORKFLOW_MODE_FAMILY_MAP = Object.freeze({
    retail: 'retail',
    services: 'services',
    manufacturing: 'food_manufacturing',
    food_manufacturing: 'food_manufacturing',
    fnb: 'fnb',
    hospitality: 'hospitality',
    healthcare: 'healthcare',
    ticketing_transport: 'ticketing_transport',
    logistics_distribution: 'logistics_distribution',
    education_institutions: 'education_institutions',
    msme: 'msme'
});

const WORKFLOW_MODE_TEMPLATE_MAP = Object.freeze({
    retail: 'retail',
    services: 'services',
    manufacturing: 'food_manufacturing',
    food_manufacturing: 'food_manufacturing',
    fnb: 'fnb',
    hospitality: 'hospitality',
    healthcare: 'healthcare',
    ticketing_transport: 'ticketing_transport',
    logistics_distribution: 'logistics_distribution',
    education_institutions: 'education_institutions',
    msme: 'msme'
});

export const WORKFLOW_MODE_PIN_META = Object.freeze({
    retail: { icon: 'ShoppingBag', label: 'Retail' },
    services: { icon: 'CalendarCheck', label: 'Services' },
    food_manufacturing: { icon: 'Factory', label: 'Food Manufacturing' },
    manufacturing: { icon: 'Factory', label: 'Food Manufacturing' },
    fnb: { icon: 'Utensils', label: 'Food & Beverage' },
    hospitality: { icon: 'Hotel', label: 'Hospitality' },
    healthcare: { icon: 'HeartPulse', label: 'Healthcare' },
    ticketing_transport: { icon: 'Ticket', label: 'Ticketing & Transport' },
    logistics_distribution: { icon: 'Truck', label: 'Logistics & Distribution' },
    education_institutions: { icon: 'GraduationCap', label: 'Education & Institutions' },
    msme: { icon: 'Store', label: 'Simple (MSME)' }
});

// `menuModifiers` is deliberately held by every mode. Despite the name (kept
// for continuity with the existing `fnb_modifier_*` tables), an add-on group is
// a generic catalog concept, not a restaurant one: "extra rice" on a dish, gift
// wrap on a retail SKU, an extended warranty on a repair job. The join table's
// `item_id` already points at the generic `items` table and both checkout
// resolvers are mode-agnostic, so only the management routes were ever
// restaurant-locked. It stays a real capability rather than being deleted
// because the composed-capability overlay in the next phase needs a per-tenant
// switch to turn add-ons off.
export const WORKFLOW_MODE_CAPABILITIES = Object.freeze({
    retail: ['catalog', 'inventory', 'menuModifiers', 'pos', 'storefront'],
    services: ['services', 'serviceBookings', 'serviceTickets', 'catalog', 'menuModifiers', 'pos', 'storefront'],
    manufacturing: ['foodManufacturing', 'productionWorkflows', 'inventory', 'menuModifiers', 'pos', 'storefront'],
    food_manufacturing: ['foodManufacturing', 'productionWorkflows', 'inventory', 'menuModifiers', 'pos', 'storefront'],
    fnb: [
        'fnbDining',
        'menuModifiers',
        'tableService',
        'kitchenQueue',
        'restaurantServiceCharge',
        'catalog',
        'inventory',
        'pos',
        'storefront'
    ],
    hospitality: [
        'hospitalityReservations',
        'hospitalityRooms',
        'hospitalityHousekeeping',
        'hospitalityMaintenance',
        'hospitalityFolios',
        'hospitalityRates',
        'hospitalityAmenities',
        'catalog',
        'inventory',
        'menuModifiers',
        'pos',
        'storefront'
    ],
    healthcare: ['catalog', 'inventory', 'menuModifiers', 'pos', 'storefront'],
    ticketing_transport: ['catalog', 'inventory', 'menuModifiers', 'pos', 'storefront'],
    logistics_distribution: ['catalog', 'inventory', 'menuModifiers', 'pos', 'storefront'],
    education_institutions: ['catalog', 'inventory', 'menuModifiers', 'pos', 'storefront'],
    msme: ['catalog', 'menuModifiers', 'pos', 'storefront']
});

// Master-admin gated per-tenant setting key for the Phase 6 composed-capability
// overlay. Centralized here (unlike WORKFLOW_MODE_SETTING_KEY, which predates
// this convention and is still duplicated across ~16 backend call sites) so
// this one has a single source of truth from day one.
export const ENABLED_CAPABILITIES_SETTING_KEY = 'ops_enabled_capabilities';

// Union of every capability referenced by any mode's WORKFLOW_MODE_CAPABILITIES
// entry. This is the allowlist for the enabled_capabilities overlay - a value
// outside this set is either a typo or a decommissioned capability, and is
// silently dropped by normalizeEnabledCapabilities rather than granted.
export const ALL_WORKFLOW_CAPABILITIES = Object.freeze(
    [...new Set(Object.values(WORKFLOW_MODE_CAPABILITIES).flat())].sort()
);

export const normalizeEnabledCapabilities = (value) => {
    const list = Array.isArray(value) ? value : [];
    const deduped = [...new Set(list.map((entry) => String(entry || '').trim()).filter(Boolean))];
    return Object.freeze(deduped.filter((capability) => ALL_WORKFLOW_CAPABILITIES.includes(capability)));
};

// The tenant's effective capability set: the base workflow mode's fixed list,
// composed (unioned) with whatever the master admin has additionally opted
// into via the enabled_capabilities overlay. Existing tenants with no overlay
// set resolve to exactly the base mode's list - byte-identical to pre-Phase-6
// behavior.
export const resolveEffectiveCapabilities = (value, enabledCapabilities = []) => {
    const mode = normalizeWorkflowMode(value);
    const baseCapabilities = WORKFLOW_MODE_CAPABILITIES[mode] || [];
    const overlay = normalizeEnabledCapabilities(enabledCapabilities);
    return Object.freeze([...new Set([...baseCapabilities, ...overlay])]);
};

export const normalizeWorkflowMode = (value) => {
    const normalized = String(value || '').trim().toLowerCase();
    if (!normalized) return DEFAULT_WORKFLOW_MODE;
    if (WORKFLOW_MODE_VALUES.includes(normalized)) {
        return WORKFLOW_MODE_ALIASES[normalized] || normalized;
    }
    return UNKNOWN_WORKFLOW_MODE_FALLBACK;
};

export const isWorkflowMode = (value) => (
    WORKFLOW_MODE_VALUES.includes(String(value || '').trim().toLowerCase())
);

export const resolveWorkflowModeFamily = (value) => {
    const mode = normalizeWorkflowMode(value);
    return WORKFLOW_MODE_FAMILY_MAP[mode] || DEFAULT_WORKFLOW_MODE;
};

export const resolveWorkflowTemplateMode = (value) => {
    const mode = normalizeWorkflowMode(value);
    return WORKFLOW_MODE_TEMPLATE_MAP[mode] || DEFAULT_WORKFLOW_MODE;
};

export const getWorkflowModeLabel = (value) => {
    const mode = normalizeWorkflowMode(value);
    return WORKFLOW_MODE_LABELS[mode] || WORKFLOW_MODE_LABELS[DEFAULT_WORKFLOW_MODE];
};

export const getWorkflowModePinMeta = (value) => {
    const raw = String(value || '').trim().toLowerCase();
    const mode = WORKFLOW_MODE_VALUES.includes(raw) ? raw : normalizeWorkflowMode(value);
    return WORKFLOW_MODE_PIN_META[mode] || WORKFLOW_MODE_PIN_META[DEFAULT_WORKFLOW_MODE];
};

// enabledCapabilities is optional and additive: every pre-Phase-6 call site
// that passes only (value, capability) keeps checking the base mode's fixed
// list exactly as before. Passing the tenant's enabled_capabilities overlay
// as a third argument makes the check capability-driven (composed).
export const modeHasCapability = (value, capability, enabledCapabilities = []) => {
    const normalizedCapability = String(capability || '').trim();
    const effectiveCapabilities = resolveEffectiveCapabilities(value, enabledCapabilities);
    return effectiveCapabilities.includes(normalizedCapability);
};

export const isMsmeWorkflowMode = (value) => resolveWorkflowModeFamily(value) === 'msme';
export const isServicesWorkflowMode = (value) => resolveWorkflowModeFamily(value) === 'services';
export const isFnbWorkflowMode = (value) => resolveWorkflowModeFamily(value) === 'fnb';
