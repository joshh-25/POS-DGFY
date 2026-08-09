import {
    WORKFLOW_MODE_CAPABILITIES,
    ALL_WORKFLOW_CAPABILITIES,
    resolveEffectiveCapabilities,
    resolveWorkflowModeFamily
} from './workflowModes.js';

/**
 * The Capability Module catalog — the fixed, engineering-owned vocabulary the
 * Store Template layer composes over (ADR 0037 Axis 2; issue #178 Phase 10).
 *
 * A module is a unit of selling behavior ("availment style") a store either
 * has or doesn't. Store Templates are curated bundles of modules; a tenant's
 * Store Profile is its own editable copy of a bundle. Templates and profiles
 * pick FROM this catalog — they can never add enum values, columns, or
 * business logic (binding clause, issue #178 §5).
 *
 * Enforcement classes:
 * - `gate`       — absence hard-blocks the surface (403 via
 *                  requireWorkflowCapability, or 422 via the item-taxonomy
 *                  overlay). All shipped workflow capabilities are gates.
 * - `affordance` — shapes UI/presentation only; the API accepts either way.
 * - `locked`     — present in the catalog for completeness but never
 *                  template-selectable: the effective value is determined by
 *                  compliance/registration state, not by curation.
 *
 * `status: 'planned'` marks modules this catalog reserves as roadmap slots —
 * behaviors the platform does not implement yet. They exist here so template
 * design can name them, and MUST NOT be granted to any mode or preset.
 */
export const CAPABILITY_MODULE_ENFORCEMENT = Object.freeze({
    AFFORDANCE: 'affordance',
    GATE: 'gate',
    LOCKED: 'locked'
});

// Which selling surface a module's behavior is visible on - admin-UI
// metadata only, read by the curation grid's surface badges (issue #178
// final-touch pass). Not consumed by any enforcement path.
export const CAPABILITY_MODULE_SURFACES = Object.freeze({
    POS: 'pos',
    STOREFRONT: 'storefront',
    BACK_OFFICE: 'back_office'
});

// Machine-readable form of the comment-only section headers this catalog
// already had. `order` controls the curation grid's group ordering (issue
// #178 final-touch pass).
export const CAPABILITY_MODULE_GROUPS = Object.freeze({
    universal: Object.freeze({ label: 'Universal selling surfaces', order: 1 }),
    stock: Object.freeze({ label: 'Stock & production', order: 2 }),
    services: Object.freeze({ label: 'Service bookings', order: 3 }),
    fnb: Object.freeze({ label: 'F&B dining', order: 4 }),
    hospitality: Object.freeze({ label: 'Hospitality', order: 5 }),
    presentation: Object.freeze({ label: 'Presentation & affordances', order: 6 })
});

const gateModule = (overrides) => Object.freeze({
    enforcement: 'gate',
    status: 'shipped',
    requires: Object.freeze([]),
    conflicts_with: Object.freeze([]),
    ...overrides,
    ...(overrides.requires ? { requires: Object.freeze([...overrides.requires]) } : {}),
    ...(overrides.conflicts_with ? { conflicts_with: Object.freeze([...overrides.conflicts_with]) } : {})
});

export const CAPABILITY_MODULES = Object.freeze({
    // ── Universal base surfaces (every mode holds these; the gates exist as
    //    off-switches for a future profile that can subtract) ────────────────
    catalog: gateModule({
        label: 'Item Catalog',
        description: 'The tenant\'s item/product list — names, prices, images, categories. The foundation almost every other module builds on.',
        group: 'universal',
        surface: 'back_office',
        enforced_by: 'backend/src/routes/items.js'
    }),
    pos: gateModule({
        label: 'Point of Sale',
        description: 'In-person checkout at the counter/terminal, for staff ringing up a sale face-to-face with the customer.',
        group: 'universal',
        surface: 'pos',
        requires: ['catalog'],
        enforced_by: 'backend/src/routes/pos.js'
    }),
    storefront: gateModule({
        label: 'Online Store',
        description: 'The public online store: the customer-facing catalog page and online checkout at the tenant\'s store URL. Off = the tenant sells in person only; their public store page is not reachable.',
        group: 'universal',
        surface: 'storefront',
        requires: ['catalog'],
        enforced_by: 'backend/src/routes/store.js'
    }),
    menuModifiers: gateModule({
        label: 'Add-ons & Modifiers',
        description: 'Add-on option groups attached to any item — "extra rice" on a dish, gift wrap on a retail SKU, an extended warranty on a repair job. Not restaurant-specific despite the name.',
        group: 'universal',
        surface: 'pos',
        requires: ['catalog'],
        enforced_by: 'backend/src/routes/fnb.js (modifier-group routes)'
    }),

    // ── Stock behavior ──────────────────────────────────────────────────────
    inventory: gateModule({
        label: 'Inventory & Stock Movements',
        description: 'Stock-on-hand tracking and stock movement history (receiving, adjustments, transfers) per item.',
        group: 'stock',
        surface: 'back_office',
        requires: ['catalog'],
        enforced_by: 'backend/src/routes/stockMovements.js'
    }),
    productionWorkflows: gateModule({
        label: 'Production Workflows (Job & Dispatch Orders)',
        description: 'Job orders (production runs that consume raw-material stock to produce finished goods) and dispatch orders (outbound fulfillment batches). Manufacturing-shop operations, not a simple stock count.',
        group: 'stock',
        surface: 'back_office',
        requires: ['inventory'],
        enforced_by: 'backend/src/routes/jobOrders.js, backend/src/routes/dispatchOrders.js'
    }),
    foodManufacturing: gateModule({
        label: 'Manufacturing Item Taxonomy',
        description: 'Validates items against food-manufacturing-specific classification rules (e.g. raw material vs finished good). A back-office validation rule, not a visible surface.',
        group: 'stock',
        surface: 'back_office',
        requires: ['catalog'],
        enforced_by: 'CAPABILITY_TAXONOMY_OVERLAY_MODES (item-taxonomy validation layer)'
    }),

    // ── Booking lifecycle (services) ────────────────────────────────────────
    services: gateModule({
        label: 'Service Bookings',
        description: 'Scheduled appointments with a provider and a calendar — a salon appointment, a repair job, a consultation. Settles into a POS transaction on completion.',
        group: 'services',
        surface: 'back_office',
        requires: ['catalog'],
        enforced_by: 'backend/src/routes/services.js, backend/src/routes/store.js (/services/*)'
    }),

    // ── F&B dining, tiered by operational scale ─────────────────────────────
    fnbDining: gateModule({
        label: 'F&B Dining Operations',
        description: 'Base restaurant/eatery operations layer the more specific dining modules (table service, kitchen queue, service charge) build on.',
        group: 'fnb',
        surface: 'pos',
        requires: ['catalog', 'pos'],
        enforced_by: 'backend/src/routes/fnb.js'
    }),
    tableService: gateModule({
        label: 'Table Service',
        description: 'Dining areas and tables, and orders assigned to a table — for a sit-down restaurant. Off for counter-service eateries.',
        group: 'fnb',
        surface: 'pos',
        requires: ['fnbDining'],
        enforced_by: 'backend/src/routes/fnb.js (dining-areas/tables routes)'
    }),
    kitchenQueue: gateModule({
        label: 'Kitchen Queue',
        description: 'A live queue of fired orders for the kitchen to work through, with per-item prep status.',
        group: 'fnb',
        surface: 'pos',
        requires: ['fnbDining'],
        enforced_by: 'backend/src/routes/fnb.js (kitchen routes)'
    }),
    restaurantServiceCharge: gateModule({
        label: 'Restaurant Service Charge',
        description: 'An automatic service charge line applied to dine-in checks.',
        group: 'fnb',
        surface: 'pos',
        requires: ['fnbDining'],
        enforced_by: 'backend/src/routes/fnb.js (service-charge routes)'
    }),

    // ── Folio lifecycle (hospitality), tiered by property complexity ────────
    hospitalityReservations: gateModule({
        label: 'Hospitality Reservations',
        description: 'Guest reservations and booking holds for a lodging property. Base layer the other hospitality modules build on.',
        group: 'hospitality',
        surface: 'back_office',
        requires: ['catalog'],
        enforced_by: 'backend/src/routes/hospitality.js'
    }),
    hospitalityRooms: gateModule({
        label: 'Rooms & Room Types',
        description: 'The property\'s inventory of room types and individual rooms, assigned to stays.',
        group: 'hospitality',
        surface: 'back_office',
        requires: ['hospitalityReservations'],
        enforced_by: 'backend/src/routes/hospitality.js (rooms routes)'
    }),
    hospitalityHousekeeping: gateModule({
        label: 'Housekeeping Board',
        description: 'A task board for room cleaning/turnover status. Off for small guesthouses without a housekeeping staff to manage.',
        group: 'hospitality',
        surface: 'back_office',
        requires: ['hospitalityRooms'],
        enforced_by: 'backend/src/routes/hospitality.js (housekeeping routes)'
    }),
    hospitalityMaintenance: gateModule({
        label: 'Maintenance Requests',
        description: 'Tracked maintenance/repair tickets against a room or property asset.',
        group: 'hospitality',
        surface: 'back_office',
        requires: ['hospitalityRooms'],
        enforced_by: 'backend/src/routes/hospitality.js (maintenance routes)'
    }),
    hospitalityFolios: gateModule({
        label: 'Guest Folios',
        description: 'A guest\'s running charge balance across a stay — room, incidentals, amenities — settled at checkout. The hospitality lifecycle never settles into a POS transaction the way an order does.',
        group: 'hospitality',
        surface: 'pos',
        requires: ['hospitalityReservations'],
        enforced_by: 'backend/src/routes/hospitality.js (folio routes)'
    }),
    hospitalityRates: gateModule({
        label: 'Rate Plans',
        description: 'Priced rate plans and a rate calendar for room types (e.g. seasonal or weekday/weekend pricing).',
        group: 'hospitality',
        surface: 'back_office',
        requires: ['hospitalityReservations'],
        enforced_by: 'backend/src/routes/hospitality.js (rate-plan routes)'
    }),
    hospitalityAmenities: gateModule({
        label: 'Amenities, Facilities & Packages',
        description: 'Bookable amenities, shared facilities, and bundled packages a guest can add to their stay.',
        group: 'hospitality',
        surface: 'storefront',
        requires: ['hospitalityReservations'],
        enforced_by: 'backend/src/routes/hospitality.js (amenity/facility/package routes)'
    }),

    // ── Affordance modules: presentation shaped per template, API unchanged ─
    posWorkflowPanel: Object.freeze({
        label: 'POS Workflow Panel',
        description: 'Which POS checkout panel layout the terminal shows (e.g. table-and-course flow vs a simple cart). Presentation only — the backend accepts any POS order method regardless of this setting.',
        group: 'presentation',
        surface: 'pos',
        enforcement: 'affordance',
        status: 'shipped',
        requires: Object.freeze(['pos']),
        conflicts_with: Object.freeze([]),
        enforced_by: 'frontend/src/features/pos/utils/posWorkflowResolver.js (UI shape only; backend accepts any POS order method)'
    }),
    storefrontLayout: Object.freeze({
        label: 'Storefront Layout & Journey',
        description: 'Which storefront page layout and checkout journey the public online store uses (e.g. a booking-style flow vs a standard product catalog). Presentation only.',
        group: 'presentation',
        surface: 'storefront',
        enforcement: 'affordance',
        status: 'shipped',
        requires: Object.freeze(['storefront']),
        conflicts_with: Object.freeze([]),
        enforced_by: 'frontend/apps/store storefrontTemplateRegistry.js / modePresentationRegistry.js'
    }),

    // ── Locked modules: in the catalog for completeness, never curated ──────
    fiscalProfile: Object.freeze({
        label: 'Fiscal / BIR Profile',
        description: 'BIR fiscalization/compliance policy pack. Determined by registration and compliance state, never by a Store Template — not shown in curation.',
        group: 'presentation',
        surface: 'back_office',
        enforcement: 'locked',
        status: 'shipped',
        requires: Object.freeze([]),
        conflicts_with: Object.freeze([]),
        enforced_by: 'backend/src/modules/compliance/policy (policy packs; compliance-determined, never template-determined)'
    }),
    customerAccessMode: Object.freeze({
        label: 'Customer Access Ceiling',
        description: 'The maximum level of storefront access a customer can have. Determined by platform/registration policy, never by a Store Template — not shown in curation.',
        group: 'presentation',
        surface: 'storefront',
        enforcement: 'locked',
        status: 'shipped',
        requires: Object.freeze(['storefront']),
        conflicts_with: Object.freeze([]),
        enforced_by: 'backend/src/modules/shared/utils/customerAccessPolicy.js (effective value = min of requested, platform max, registration-stage max)'
    }),

    // ── Planned modules: roadmap slots, not implemented, never grantable ────
    laborTracking: Object.freeze({
        label: 'Labor & Time Tracking',
        enforcement: 'gate',
        status: 'planned',
        requires: Object.freeze(['services']),
        conflicts_with: Object.freeze([]),
        notes: 'Who performed a job, actual start/finish timestamps, rate-based labor fees. Booking status transitions persist no timestamps today.'
    }),
    posBookings: Object.freeze({
        label: 'POS-Created Bookings',
        enforcement: 'gate',
        status: 'planned',
        requires: Object.freeze(['services', 'pos']),
        conflicts_with: Object.freeze([]),
        notes: 'Create a service_bookings row from the POS terminal (ServiceBooking.source="pos" is currently unreachable). Today only booking→settle→POS exists.'
    }),
    bookingRescheduling: Object.freeze({
        label: 'Booking Reschedule & Reassignment',
        enforcement: 'gate',
        status: 'planned',
        requires: Object.freeze(['services']),
        conflicts_with: Object.freeze([]),
        notes: 'provider_user_id, resource_id and start_at are write-once at creation today.'
    }),
    pickupReturnLogistics: Object.freeze({
        label: 'Pickup-and-Return Fulfillment',
        enforcement: 'gate',
        status: 'planned',
        requires: Object.freeze(['services']),
        conflicts_with: Object.freeze([]),
        notes: 'Laundry-shop round trip: scheduled customer pickup, in-shop custody, return delivery. DeliveryJob is one-way and 1:1 with a POS transaction today.'
    })
});

export const ALL_CAPABILITY_MODULE_KEYS = Object.freeze(Object.keys(CAPABILITY_MODULES));

export const SHIPPED_GATE_MODULE_KEYS = Object.freeze(
    ALL_CAPABILITY_MODULE_KEYS.filter((key) => {
        const module = CAPABILITY_MODULES[key];
        return module.status === 'shipped' && module.enforcement === 'gate';
    })
);

/**
 * Validate a module selection (a template bundle or profile edit) against the
 * catalog's requires/conflicts_with edges. Returns { ok, unknown, unbuildable,
 * missing_requirements, conflicts } — publish-time validation for the landlord
 * template catalog (issue #178 Phase 13), usable today in tests.
 */
export const validateModuleSelection = (moduleKeys) => {
    const selection = [...new Set((Array.isArray(moduleKeys) ? moduleKeys : [])
        .map((key) => String(key || '').trim())
        .filter(Boolean))];

    const unknown = selection.filter((key) => !CAPABILITY_MODULES[key]);
    const known = selection.filter((key) => CAPABILITY_MODULES[key]);
    const unbuildable = known.filter((key) => CAPABILITY_MODULES[key].status !== 'shipped');

    const missingRequirements = [];
    const conflicts = [];
    const selected = new Set(known);
    for (const key of known) {
        const module = CAPABILITY_MODULES[key];
        for (const requirement of module.requires) {
            if (!selected.has(requirement)) {
                missingRequirements.push({ module: key, requires: requirement });
            }
        }
        for (const conflict of module.conflicts_with) {
            if (selected.has(conflict)) {
                conflicts.push({ module: key, conflicts_with: conflict });
            }
        }
    }

    return {
        ok: unknown.length === 0
            && unbuildable.length === 0
            && missingRequirements.length === 0
            && conflicts.length === 0,
        unknown,
        unbuildable,
        missing_requirements: missingRequirements,
        conflicts
    };
};

/**
 * The gate-module bundle a workflow mode resolves to today. By construction
 * this is exactly resolveEffectiveCapabilities(mode, enabled, disabled) — the
 * catalog introduces no behavior of its own (issue #178 Phase 10: metadata
 * only). The equivalence is pinned by capabilityModules.contract.test.js.
 * No production caller today (test/documentation-only) - kept in step with
 * resolveEffectiveCapabilities's full signature (issue #178 Phase 16) rather
 * than left on a stale 2-arg claim.
 */
export const resolveModeModuleBundle = (workflowMode, enabledCapabilities = [], disabledCapabilities = []) => (
    resolveEffectiveCapabilities(workflowMode, enabledCapabilities, disabledCapabilities)
);

/**
 * Curated Store Template presets — the source data
 * `seedCanonicalTemplatePresetsUseCase`
 * (`backend/src/modules/templates/usecases/seedCanonicalTemplatePresets.js`)
 * materializes into landlord `store_configuration_templates` rows (issue
 * #178 Phase 13). They document the two dimensions templates vary on:
 * 1. selling-behavior mix (a services shop that also retails parts), and
 * 2. operational scale within one vertical (full-service restaurant vs
 *    counter-service carenderia — same food business, different module tiers).
 * Every preset must pass validateModuleSelection; the canonical preset of
 * each base mode must equal the mode's own capability list, so materializing
 * a preset is provably behavior-identical to the mode it packages.
 */
export const STORE_TEMPLATE_PRESETS = Object.freeze({
    fnb_full_service: Object.freeze({
        label: 'Full-Service Restaurant',
        base_mode: 'fnb',
        canonical: true,
        modules: Object.freeze([...WORKFLOW_MODE_CAPABILITIES.fnb])
    }),
    fnb_counter_service: Object.freeze({
        label: 'Counter-Service Eatery / Carenderia',
        base_mode: 'fnb',
        canonical: false,
        modules: Object.freeze(WORKFLOW_MODE_CAPABILITIES.fnb.filter((key) => (
            !['tableService', 'kitchenQueue', 'restaurantServiceCharge'].includes(key)
        )))
    }),
    retail_store: Object.freeze({
        label: 'Retail Store',
        base_mode: 'retail',
        canonical: true,
        modules: Object.freeze([...WORKFLOW_MODE_CAPABILITIES.retail])
    }),
    services_shop: Object.freeze({
        label: 'Service Shop (labor only)',
        base_mode: 'services',
        canonical: true,
        modules: Object.freeze([...WORKFLOW_MODE_CAPABILITIES.services])
    }),
    services_with_parts_retail: Object.freeze({
        label: 'Service Shop with Parts Retail',
        base_mode: 'services',
        canonical: false,
        modules: Object.freeze([...new Set([...WORKFLOW_MODE_CAPABILITIES.services, 'inventory'])])
    }),
    hospitality_property: Object.freeze({
        label: 'Hospitality Property',
        base_mode: 'hospitality',
        canonical: true,
        modules: Object.freeze([...WORKFLOW_MODE_CAPABILITIES.hospitality])
    }),
    hospitality_guesthouse: Object.freeze({
        label: 'Guesthouse (no housekeeping/maintenance boards)',
        base_mode: 'hospitality',
        canonical: false,
        modules: Object.freeze(WORKFLOW_MODE_CAPABILITIES.hospitality.filter((key) => (
            !['hospitalityHousekeeping', 'hospitalityMaintenance'].includes(key)
        )))
    }),
    food_manufacturer: Object.freeze({
        label: 'Food Manufacturer',
        base_mode: 'food_manufacturing',
        canonical: true,
        modules: Object.freeze([...WORKFLOW_MODE_CAPABILITIES.food_manufacturing])
    }),
    msme_simple: Object.freeze({
        label: 'Simple MSME',
        base_mode: 'msme',
        canonical: true,
        modules: Object.freeze([...WORKFLOW_MODE_CAPABILITIES.msme])
    })
});

/**
 * Registration offers 10 Operating Mode choices (WORKFLOW_MODE_VALUES minus
 * the deprecated `manufacturing` alias) but only 6 of them have a curated
 * template preset above. These 4 are intentionally bare, not an oversight:
 * `healthcare`, `ticketing_transport`, `logistics_distribution`, and
 * `education_institutions` are candidates for verticals that may end up
 * powered by separate sibling apps under the same parent company, with DGFY
 * providing registration and UI/UX visibility only - the operating "engine"
 * living elsewhere. Until that direction is decided (tracked in a follow-up
 * issue), they stay retail-shaped (see WORKFLOW_MODE_CAPABILITIES) and
 * preset-less: a tenant registering in one of these modes provisions with
 * null template provenance, which the whole system already tolerates by
 * design (ADR 0056 - provenance is never required for a mode to function).
 *
 * This list exists so that bareness is a checked, deliberate fact rather
 * than a silent gap: capabilityModules.contract.test.js asserts these four
 * (and only these four) offered modes lack a canonical preset. Adding an
 * 11th mode without deciding its preset story, or seeding a preset for one
 * of these four without removing it from this list first, both fail that
 * test loudly instead of drifting unnoticed.
 */
export const STORE_TEMPLATE_PRESETLESS_MODES = Object.freeze([
    'healthcare',
    'ticketing_transport',
    'logistics_distribution',
    'education_institutions'
]);

/**
 * Which module groups the curation grid shows by default for a given base
 * mode (issue #178 final-touch pass). A filter, not a fence: it exists so
 * the admin template form doesn't dump all 21 selectable modules on every
 * screen regardless of relevance, but the grid always offers a "Show all
 * module groups" escape hatch, and a group already holding a selected
 * module is force-shown even when the base mode wouldn't otherwise surface
 * it — so no legitimate cross-family bundle (e.g. services_with_parts_retail,
 * which adds `inventory` to a services-based template) is ever inexpressible.
 *
 * Deliberately explicit metadata rather than derived from
 * WORKFLOW_MODE_CAPABILITIES: a template's whole purpose is to deviate from
 * its base mode's default capability list, so deriving visibility from that
 * list would hide exactly the modules an admin is most likely to be adding.
 *
 * Keyed by workflow mode FAMILY (resolveWorkflowModeFamily's output), so the
 * `manufacturing` alias resolves without a duplicate entry. Every family maps
 * to a value containing 'universal'. External-engine modes are not
 * authorable (TEMPLATE_AUTHORABLE_MODES in workflowModes.js), but a
 * pre-existing template row for one can still be viewed - a retail-shaped
 * fallback covers that case.
 */
export const MODE_FAMILY_MODULE_GROUPS = Object.freeze({
    retail: Object.freeze(['universal', 'stock', 'presentation']),
    services: Object.freeze(['universal', 'services', 'stock', 'presentation']),
    food_manufacturing: Object.freeze(['universal', 'stock', 'presentation']),
    fnb: Object.freeze(['universal', 'fnb', 'stock', 'presentation']),
    hospitality: Object.freeze(['universal', 'hospitality', 'stock', 'presentation']),
    msme: Object.freeze(['universal', 'presentation']),
    // External modes are not authorable, but a pre-existing template row
    // (or a future flip back to native) still needs a sensible grid.
    healthcare: Object.freeze(['universal', 'stock', 'presentation']),
    ticketing_transport: Object.freeze(['universal', 'stock', 'presentation']),
    logistics_distribution: Object.freeze(['universal', 'stock', 'presentation']),
    education_institutions: Object.freeze(['universal', 'stock', 'presentation'])
});

export const resolveModeFamilyModuleGroups = (workflowMode) => (
    MODE_FAMILY_MODULE_GROUPS[resolveWorkflowModeFamily(workflowMode)] || MODE_FAMILY_MODULE_GROUPS.retail
);

// Guard against typos drifting from the enforced vocabulary: every shipped
// gate module whose key is a workflow capability must exist there, and vice
// versa nothing outside the catalog may claim to be a capability.
export const CAPABILITY_MODULE_VOCABULARY_ALIGNED = Object.freeze({
    capability_keys_missing_from_catalog: ALL_WORKFLOW_CAPABILITIES.filter(
        (key) => !CAPABILITY_MODULES[key]
    ),
    shipped_gate_modules_outside_capability_vocabulary: SHIPPED_GATE_MODULE_KEYS.filter(
        (key) => !ALL_WORKFLOW_CAPABILITIES.includes(key)
    )
});
