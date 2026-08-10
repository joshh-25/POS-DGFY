import { WORKFLOW_MODE_ENGINE, WORKFLOW_MODE_ENGINE_NOTES } from './workflowModes.js';

/**
 * The merchant-facing Industry catalog for business registration (issue #178
 * "templates become the Operating Mode" follow-up). Source: DGFY's own
 * "Sample Business Niches by Industry" classification guide.
 *
 * This is the layer that closes the gap between two things that used to look
 * unrelated: Operating Mode (a fixed engineering enum, `workflowModes.js`)
 * and Store Template (a curated, versioned bundle of Capability Modules,
 * `capabilityModules.js`). A canonical template's module list is contractually
 * equal to its base mode's capability list (`capabilityModules.contract.test.js`),
 * so picking a template already implies a mode - a merchant should never have
 * to pick both. Every entry below is what a merchant actually chooses at
 * signup; `workflow_mode` and `template_key` are derived from it, never
 * chosen independently.
 *
 * `micro_fnb` is the entry that proves the point: "carinderia, turo-turo,
 * food cart" is the guide's own industry #05, and it previously existed in
 * the platform ONLY as a template (`fnb_counter_service`) with no mode of its
 * own - unreachable from registration. It is included here with no new mode:
 * `workflow_mode: 'fnb'`, `template_key: 'fnb_counter_service'`.
 *
 * Deliberately NOT modeled: the guide's industry #12, "Technology and
 * Digital Products" (software/SaaS/subscriptions). It needs its own
 * lifecycle - licensing, renewals, entitlement - not a POS/stock template,
 * and is tracked as a separate issue rather than forced into this catalog.
 *
 * Deliberately NOT reachable here (see REGISTRATION_EXCLUDED_TEMPLATE_KEYS):
 * `services_with_parts_retail` and `hospitality_guesthouse`. Both are real,
 * published presets, but they are refinements *within* an industry a
 * merchant has already registered into (repair shops that also sell parts;
 * a smaller hospitality tier), applied afterward by a platform admin via
 * `POST /admin/tenants/:id/apply-template` rather than offered as a
 * thirteenth choice at signup.
 */

// A published preset a merchant could reach through REGISTRATION_INDUSTRIES
// but deliberately does not - see the file doc comment above. Every key in
// STORE_TEMPLATE_PRESETS must appear either as a `template_key` below or in
// this list (registrationIndustries.contract.test.js), so a new preset is
// forced to make a conscious registration-reachability decision rather than
// silently landing in neither.
export const REGISTRATION_EXCLUDED_TEMPLATE_KEYS = Object.freeze([
    'services_with_parts_retail',
    'hospitality_guesthouse'
]);

export const REGISTRATION_INDUSTRIES = Object.freeze({
    retail: Object.freeze({
        order: 1,
        label: 'Retail',
        summary: 'Businesses that primarily resell products to customers without manufacturing them.',
        niches: Object.freeze([
            'Supermarket', 'Grocery store', 'Convenience store', 'Clothing boutique',
            'Shoe store', 'Hardware store', 'Electronics store', 'Furniture store'
        ]),
        workflow_mode: 'retail',
        template_key: 'retail_store'
    }),
    micro_retail: Object.freeze({
        order: 2,
        label: 'Micro-Retail or Simple MSME',
        summary: 'Small, usually owner-managed neighborhood businesses with a simple product catalog.',
        niches: Object.freeze([
            'Sari-sari store', 'Small neighborhood grocery', 'Market stall', 'Dry-goods stall',
            'Ukay-ukay stall', 'Home-based online seller', 'Reseller business'
        ]),
        workflow_mode: 'msme',
        template_key: 'msme_simple'
    }),
    services: Object.freeze({
        order: 3,
        label: 'Services',
        summary: 'Businesses that primarily sell skills, labor, appointments, repairs, or professional services.',
        niches: Object.freeze([
            'Hair salon', 'Barbershop', 'Nail salon', 'Spa and massage center',
            'Laundry shop', 'Computer repair shop', 'Auto repair shop', 'Photography studio'
        ]),
        workflow_mode: 'services',
        template_key: 'services_shop'
    }),
    fnb: Object.freeze({
        order: 4,
        label: 'Food & Beverage',
        summary: 'Established businesses preparing meals or drinks for immediate consumption.',
        niches: Object.freeze([
            'Full-service restaurant', 'Casual-dining restaurant', 'Fast-food restaurant', 'Café',
            'Coffee shop', 'Milk-tea shop', 'Bakery café', 'Pizza restaurant'
        ]),
        workflow_mode: 'fnb',
        template_key: 'fnb_full_service'
    }),
    micro_fnb: Object.freeze({
        order: 5,
        label: 'Micro Food & Beverage',
        summary: 'Small or home-based food businesses with limited menus and simpler operations.',
        niches: Object.freeze([
            'Carinderia', 'Small eatery', 'Turo-turo', 'Food cart',
            'Street-food stall', 'Barbecue stall', 'Silog stall', 'Home-based baker'
        ]),
        workflow_mode: 'fnb',
        template_key: 'fnb_counter_service'
    }),
    food_manufacturing: Object.freeze({
        order: 6,
        label: 'Food Manufacturing',
        summary: 'Businesses that produce packaged, processed, preserved, or bulk food products for resale or distribution.',
        niches: Object.freeze([
            'Bottled-sauce manufacturer', 'Packaged-snack producer', 'Bread and pastry commissary',
            'Frozen-food manufacturer', 'Processed-meat manufacturer', 'Coffee-roasting company',
            'Beverage manufacturer', 'Central kitchen supplying branches'
        ]),
        workflow_mode: 'food_manufacturing',
        template_key: 'food_manufacturer'
    }),
    hospitality: Object.freeze({
        order: 7,
        label: 'Hospitality',
        summary: 'Businesses primarily offering short-term accommodation and guest experiences.',
        niches: Object.freeze([
            'Hotel', 'Resort', 'Beach resort', 'Boutique hotel',
            'Hostel', 'Inn', 'Pension house', 'Bed and breakfast'
        ]),
        workflow_mode: 'hospitality',
        template_key: 'hospitality_property'
    }),
    healthcare: Object.freeze({
        order: 8,
        label: 'Healthcare',
        summary: 'Licensed health facilities and providers offering consultation, treatment, testing, or wellness-related care.',
        niches: Object.freeze([
            'Family clinic', 'Medical clinic', 'Dental clinic', 'Diagnostic laboratory',
            'Physical-therapy clinic', 'Veterinary clinic', 'Vaccination center'
        ]),
        workflow_mode: 'healthcare',
        template_key: null
    }),
    ticketing_transport: Object.freeze({
        order: 9,
        label: 'Ticketing and Transport',
        summary: 'Businesses transporting passengers or managing routes, reservations, seats, and tickets.',
        niches: Object.freeze([
            'Bus operator', 'Ferry operator', 'Airline ticketing agency', 'Van shuttle service',
            'Car-rental company', 'Tourist boat operator', 'Event-ticketing provider'
        ]),
        workflow_mode: 'ticketing_transport',
        template_key: null
    }),
    logistics_distribution: Object.freeze({
        order: 10,
        label: 'Logistics and Distribution',
        summary: 'Businesses moving, storing, supplying, or delivering goods rather than passengers.',
        niches: Object.freeze([
            'Courier service', 'Parcel-delivery company', 'Trucking company', 'Freight-forwarding company',
            'Warehousing company', 'Fulfillment center', 'Food distributor'
        ]),
        workflow_mode: 'logistics_distribution',
        template_key: null
    }),
    education_institutions: Object.freeze({
        order: 11,
        label: 'Education and Institutions',
        summary: 'Schools, training providers, organizations, and institutions offering programs, facilities, events, or public services.',
        niches: Object.freeze([
            'Preschool', 'Elementary school', 'Tutorial center', 'Review center',
            'Training center', 'Language school', 'Vocational school', 'Nonprofit organization'
        ]),
        workflow_mode: 'education_institutions',
        template_key: null
    })
});

export const REGISTRATION_INDUSTRY_KEYS = Object.freeze(
    Object.keys(REGISTRATION_INDUSTRIES).sort(
        (a, b) => REGISTRATION_INDUSTRIES[a].order - REGISTRATION_INDUSTRIES[b].order
    )
);

export const REGISTRATION_INDUSTRY_TEMPLATE_KEYS = Object.freeze(
    REGISTRATION_INDUSTRY_KEYS
        .map((key) => REGISTRATION_INDUSTRIES[key].template_key)
        .filter(Boolean)
);

export const resolveRegistrationIndustry = (industryKey) => (
    REGISTRATION_INDUSTRIES[String(industryKey || '').trim()] || null
);

/**
 * The engine classification a template-less industry still needs to be
 * honest about (issue #178 final-touch pass): `engine`
 * ('native' | 'transitional' | 'external') and `engine_note` (the planned
 * sibling-app name, transitional modes only). Pure derivation over any
 * object carrying a `workflow_mode` - no new state, so it can never drift
 * from WORKFLOW_MODE_ENGINE. Extracted (issue #316) so a DB-driven catalog
 * row gets the exact same join as a constant entry, not a re-implementation
 * of it.
 */
export const withEngineClassification = (entry) => ({
    engine: WORKFLOW_MODE_ENGINE[entry.workflow_mode] || 'native',
    engine_note: WORKFLOW_MODE_ENGINE_NOTES[entry.workflow_mode] || null
});

/**
 * The full merchant-facing entry, joined with the engine classification.
 */
export const describeRegistrationIndustry = (industryKey) => {
    const entry = resolveRegistrationIndustry(industryKey);
    if (!entry) return null;
    return Object.freeze({
        key: industryKey,
        ...entry,
        ...withEngineClassification(entry)
    });
};

export const REGISTRATION_INDUSTRIES_DESCRIBED = Object.freeze(
    REGISTRATION_INDUSTRY_KEYS.map((key) => describeRegistrationIndustry(key))
);
