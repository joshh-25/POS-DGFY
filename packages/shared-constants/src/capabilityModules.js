import {
    WORKFLOW_MODE_CAPABILITIES,
    ALL_WORKFLOW_CAPABILITIES,
    resolveEffectiveCapabilities
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
        enforced_by: 'backend/src/routes/items.js'
    }),
    pos: gateModule({
        label: 'Point of Sale',
        requires: ['catalog'],
        enforced_by: 'backend/src/routes/pos.js'
    }),
    storefront: gateModule({
        label: 'Online Store',
        requires: ['catalog'],
        enforced_by: 'backend/src/routes/store.js'
    }),
    menuModifiers: gateModule({
        label: 'Add-ons & Modifiers',
        requires: ['catalog'],
        enforced_by: 'backend/src/routes/fnb.js (modifier-group routes)'
    }),

    // ── Stock behavior ──────────────────────────────────────────────────────
    inventory: gateModule({
        label: 'Inventory & Stock Movements',
        requires: ['catalog'],
        enforced_by: 'backend/src/routes/stockMovements.js'
    }),
    productionWorkflows: gateModule({
        label: 'Production Workflows (Job & Dispatch Orders)',
        requires: ['inventory'],
        enforced_by: 'backend/src/routes/jobOrders.js, backend/src/routes/dispatchOrders.js'
    }),
    foodManufacturing: gateModule({
        label: 'Manufacturing Item Taxonomy',
        requires: ['catalog'],
        enforced_by: 'CAPABILITY_TAXONOMY_OVERLAY_MODES (item-taxonomy validation layer)'
    }),

    // ── Booking lifecycle (services) ────────────────────────────────────────
    services: gateModule({
        label: 'Service Bookings',
        requires: ['catalog'],
        enforced_by: 'backend/src/routes/services.js, backend/src/routes/store.js (/services/*)'
    }),

    // ── F&B dining, tiered by operational scale ─────────────────────────────
    fnbDining: gateModule({
        label: 'F&B Dining Operations',
        requires: ['catalog', 'pos'],
        enforced_by: 'backend/src/routes/fnb.js'
    }),
    tableService: gateModule({
        label: 'Table Service',
        requires: ['fnbDining'],
        enforced_by: 'backend/src/routes/fnb.js (dining-areas/tables routes)'
    }),
    kitchenQueue: gateModule({
        label: 'Kitchen Queue',
        requires: ['fnbDining'],
        enforced_by: 'backend/src/routes/fnb.js (kitchen routes)'
    }),
    restaurantServiceCharge: gateModule({
        label: 'Restaurant Service Charge',
        requires: ['fnbDining'],
        enforced_by: 'backend/src/routes/fnb.js (service-charge routes)'
    }),

    // ── Folio lifecycle (hospitality), tiered by property complexity ────────
    hospitalityReservations: gateModule({
        label: 'Hospitality Reservations',
        requires: ['catalog'],
        enforced_by: 'backend/src/routes/hospitality.js'
    }),
    hospitalityRooms: gateModule({
        label: 'Rooms & Room Types',
        requires: ['hospitalityReservations'],
        enforced_by: 'backend/src/routes/hospitality.js (rooms routes)'
    }),
    hospitalityHousekeeping: gateModule({
        label: 'Housekeeping Board',
        requires: ['hospitalityRooms'],
        enforced_by: 'backend/src/routes/hospitality.js (housekeeping routes)'
    }),
    hospitalityMaintenance: gateModule({
        label: 'Maintenance Requests',
        requires: ['hospitalityRooms'],
        enforced_by: 'backend/src/routes/hospitality.js (maintenance routes)'
    }),
    hospitalityFolios: gateModule({
        label: 'Guest Folios',
        requires: ['hospitalityReservations'],
        enforced_by: 'backend/src/routes/hospitality.js (folio routes)'
    }),
    hospitalityRates: gateModule({
        label: 'Rate Plans',
        requires: ['hospitalityReservations'],
        enforced_by: 'backend/src/routes/hospitality.js (rate-plan routes)'
    }),
    hospitalityAmenities: gateModule({
        label: 'Amenities, Facilities & Packages',
        requires: ['hospitalityReservations'],
        enforced_by: 'backend/src/routes/hospitality.js (amenity/facility/package routes)'
    }),

    // ── Affordance modules: presentation shaped per template, API unchanged ─
    posWorkflowPanel: Object.freeze({
        label: 'POS Workflow Panel',
        enforcement: 'affordance',
        status: 'shipped',
        requires: Object.freeze(['pos']),
        conflicts_with: Object.freeze([]),
        enforced_by: 'frontend/src/features/pos/utils/posWorkflowResolver.js (UI shape only; backend accepts any POS order method)'
    }),
    storefrontLayout: Object.freeze({
        label: 'Storefront Layout & Journey',
        enforcement: 'affordance',
        status: 'shipped',
        requires: Object.freeze(['storefront']),
        conflicts_with: Object.freeze([]),
        enforced_by: 'frontend/apps/store storefrontTemplateRegistry.js / modePresentationRegistry.js'
    }),

    // ── Locked modules: in the catalog for completeness, never curated ──────
    fiscalProfile: Object.freeze({
        label: 'Fiscal / BIR Profile',
        enforcement: 'locked',
        status: 'shipped',
        requires: Object.freeze([]),
        conflicts_with: Object.freeze([]),
        enforced_by: 'backend/src/modules/compliance/policy (policy packs; compliance-determined, never template-determined)'
    }),
    customerAccessMode: Object.freeze({
        label: 'Customer Access Ceiling',
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
