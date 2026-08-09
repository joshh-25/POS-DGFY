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
//
// `catalog`, `pos`, and `storefront` follow the same universal-off-switch
// pattern: every mode holds them, and each gates its whole surface (items
// router, POS router, public store router), so today they change nothing — but
// a Store Profile that can subtract modules gets a real switch for "no online
// store" / "no POS" tiers without new plumbing.
//
// Every capability in this registry must be read by a guard: either a
// `requireWorkflowCapability` route gate or the item-taxonomy overlay
// (CAPABILITY_TAXONOMY_OVERLAY_MODES — how `foodManufacturing` is enforced).
// backend/tests/workflowCapabilities.enforcement.contract.test.js fails when a
// declared capability has no reader, so decorative entries cannot reappear.
export const WORKFLOW_MODE_CAPABILITIES = Object.freeze({
    retail: ['catalog', 'inventory', 'menuModifiers', 'pos', 'storefront'],
    services: ['services', 'catalog', 'menuModifiers', 'pos', 'storefront'],
    manufacturing: ['foodManufacturing', 'productionWorkflows', 'catalog', 'inventory', 'menuModifiers', 'pos', 'storefront'],
    food_manufacturing: ['foodManufacturing', 'productionWorkflows', 'catalog', 'inventory', 'menuModifiers', 'pos', 'storefront'],
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

// Phase 16 (issue #178): the subtractive counterpart to
// ENABLED_CAPABILITIES_SETTING_KEY, so a Store Template's module list can
// remove a capability from a mode's base list, not just add to one -
// without it, non-canonical presets like fnb_counter_service (fnb minus
// tableService/kitchenQueue/restaurantServiceCharge) are inexpressible as a
// Profile. Mirrors ENABLED_CAPABILITIES_SETTING_KEY's governance shape
// exactly (single-source key, master-admin gated write, 15s tenant-scoped
// cache) rather than a second authorization model.
//
// Normalized against the same ALL_WORKFLOW_CAPABILITIES allowlist as the
// enabled overlay - since a `locked` module (fiscalProfile,
// customerAccessMode) never appears in any mode's base list, it can never
// appear in ALL_WORKFLOW_CAPABILITIES either, so it stays unreachable by
// this overlay too (ADR 0056 clause 1, unaffected by this amendment).
export const DISABLED_CAPABILITIES_SETTING_KEY = 'ops_disabled_capabilities';

export const normalizeDisabledCapabilities = (value) => {
    const list = Array.isArray(value) ? value : [];
    const deduped = [...new Set(list.map((entry) => String(entry || '').trim()).filter(Boolean))];
    return Object.freeze(deduped.filter((capability) => ALL_WORKFLOW_CAPABILITIES.includes(capability)));
};

// Phase 9 Axis 4 delegation switch: does this platform's own inventory
// module own the tenant's stock ledger (the 'platform' default), or has the
// tenant delegated ledger authority to an external inventory-management
// system? Mirrors ENABLED_CAPABILITIES_SETTING_KEY's governance shape
// (single-source key here, master-admin gated write, short-TTL cache)
// rather than the ungoverned, unvalidated multi_location_inventory_enabled
// flag - see docs/features/INVENTORY_TRACKING_MODES.md and ADR 0037/0038.
export const INVENTORY_AUTHORITY_SETTING_KEY = 'inventory_authority';

export const DEFAULT_INVENTORY_AUTHORITY = 'platform';

// 'external_ims' deliberately reuses the exact string already defined as
// TRACKING_MODE.EXTERNAL_IMS in stockBearingPolicy.js - the tenant-level
// delegation switch and the item-level tracking mode share one vocabulary on
// purpose, so the item validator's gate is a plain equality check
// (item tracking_mode === tenant inventory_authority) rather than a mapping
// table between two parallel enums.
export const INVENTORY_AUTHORITY_VALUES = Object.freeze(['platform', 'external_ims']);

export const normalizeInventoryAuthority = (value) => {
    const normalized = String(value || '').trim().toLowerCase();
    return INVENTORY_AUTHORITY_VALUES.includes(normalized) ? normalized : DEFAULT_INVENTORY_AUTHORITY;
};

export const isDelegatedInventoryAuthority = (value) => normalizeInventoryAuthority(value) === 'external_ims';

// The tenant's effective capability set: the base workflow mode's fixed list,
// composed (unioned) with whatever the master admin has additionally opted
// into via the enabled_capabilities overlay, then (Phase 16) with whatever
// has been removed via the disabled_capabilities overlay. Existing tenants
// with no overlay set resolve to exactly the base mode's list -
// byte-identical to pre-Phase-6 behavior. disabledCapabilities is applied
// last, so a capability present in both overlays always resolves to
// disabled - subtraction wins over addition, matching a template's "this
// module is off" being the more specific instruction. A write that would
// leave a capability in both overlays is itself rejected before it can be
// persisted (updateSettingsUseCase.js / updateSettingByKeyUseCase.js, issue
// #178 Phase 22) - this ordering is the belt to that write-time braces, not
// a case this function expects to see in practice.
export const resolveEffectiveCapabilities = (value, enabledCapabilities = [], disabledCapabilities = []) => {
    const mode = normalizeWorkflowMode(value);
    const baseCapabilities = WORKFLOW_MODE_CAPABILITIES[mode] || [];
    const overlay = normalizeEnabledCapabilities(enabledCapabilities);
    const removed = normalizeDisabledCapabilities(disabledCapabilities);
    const composed = new Set([...baseCapabilities, ...overlay]);
    removed.forEach((capability) => composed.delete(capability));
    return Object.freeze([...composed]);
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

// enabledCapabilities and disabledCapabilities are optional: every
// pre-Phase-6 call site that passes only (value, capability) keeps checking
// the base mode's fixed list exactly as before. Passing the tenant's
// enabled_capabilities overlay makes the check composed (additive); passing
// disabled_capabilities (Phase 16) as a fourth argument makes it subtractive
// too.
export const modeHasCapability = (value, capability, enabledCapabilities = [], disabledCapabilities = []) => {
    const normalizedCapability = String(capability || '').trim();
    const effectiveCapabilities = resolveEffectiveCapabilities(value, enabledCapabilities, disabledCapabilities);
    return effectiveCapabilities.includes(normalizedCapability);
};

export const isMsmeWorkflowMode = (value) => resolveWorkflowModeFamily(value) === 'msme';
export const isServicesWorkflowMode = (value) => resolveWorkflowModeFamily(value) === 'services';
export const isFnbWorkflowMode = (value) => resolveWorkflowModeFamily(value) === 'fnb';
