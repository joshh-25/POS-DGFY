import {
    DEFAULT_WORKFLOW_MODE as backendDefaultMode,
    WORKFLOW_MODE_LABELS as backendLabels,
    WORKFLOW_MODE_PIN_META as backendPins,
    WORKFLOW_MODE_VALUES as backendValues,
    ALL_WORKFLOW_CAPABILITIES as backendAllCapabilities,
    ENABLED_CAPABILITIES_SETTING_KEY as backendEnabledCapabilitiesKey,
    modeHasCapability as backendModeHasCapability,
    normalizeEnabledCapabilities as normalizeBackendEnabledCapabilities,
    normalizeWorkflowMode as normalizeBackendWorkflowMode,
    resolveEffectiveCapabilities as resolveBackendEffectiveCapabilities,
    resolveWorkflowModeFamily as resolveBackendWorkflowModeFamily,
    resolveWorkflowTemplateMode as resolveBackendWorkflowTemplateMode
} from '../src/modules/shared/constants/workflowModes.js';
import {
    DEFAULT_WORKFLOW_MODE as frontendDefaultMode,
    WORKFLOW_MODE_LABELS as frontendLabels,
    WORKFLOW_MODE_PIN_META as frontendPins,
    WORKFLOW_MODE_VALUES as frontendValues,
    ALL_WORKFLOW_CAPABILITIES as frontendAllCapabilities,
    ENABLED_CAPABILITIES_SETTING_KEY as frontendEnabledCapabilitiesKey,
    modeHasCapability as frontendModeHasCapability,
    normalizeEnabledCapabilities as normalizeFrontendEnabledCapabilities,
    normalizeWorkflowMode as normalizeFrontendWorkflowMode,
    resolveEffectiveCapabilities as resolveFrontendEffectiveCapabilities,
    resolveWorkflowModeFamily as resolveFrontendWorkflowModeFamily,
    resolveWorkflowTemplateMode as resolveFrontendWorkflowTemplateMode
} from '../../dgfy-web/src/features/settings/workflowMode.js';

describe('workflow mode cross-layer contracts', () => {
    it('keeps backend and frontend workflow mode value set aligned', () => {
        expect(frontendDefaultMode).toBe(backendDefaultMode);
        expect(frontendValues).toEqual(backendValues);
    });

    it('keeps backend and frontend workflow mode label map aligned', () => {
        expect(frontendLabels).toEqual(backendLabels);
    });

    it('keeps backend and frontend mode pin metadata aligned', () => {
        expect(frontendPins).toEqual(backendPins);
        expect(frontendPins.services.icon).toBe('CalendarCheck');
        expect(frontendPins.fnb.label).toBe('Food & Beverage');
        expect(frontendPins.fnb.icon).toBe('Utensils');
        expect(frontendPins.food_manufacturing.icon).toBe('Factory');
    });

    it('resolves normalization, mode family, and template family identically across layers', () => {
        const unknownModeInputs = ['UNKNOWN', '', null, undefined, '  retail  ', 'msme', 'FNB', 'hospitality', 'education_institutions', 'manufacturing', 'food_manufacturing', 'services'];

        unknownModeInputs.forEach((input) => {
            const backendMode = normalizeBackendWorkflowMode(input);
            const frontendMode = normalizeFrontendWorkflowMode(input);
            expect(frontendMode).toBe(backendMode);

            const backendFamily = resolveBackendWorkflowModeFamily(input);
            const frontendFamily = resolveFrontendWorkflowModeFamily(input);
            expect(frontendFamily).toBe(backendFamily);

            const backendTemplate = resolveBackendWorkflowTemplateMode(input);
            const frontendTemplate = resolveFrontendWorkflowTemplateMode(input);
            expect(frontendTemplate).toBe(backendTemplate);
        });
    });

    it('resolves an empty/missing mode to the platform default but an unrecognized mode string to the neutral fallback', () => {
        ['', null, undefined].forEach((input) => {
            expect(normalizeBackendWorkflowMode(input)).toBe(backendDefaultMode);
            expect(normalizeFrontendWorkflowMode(input)).toBe(frontendDefaultMode);
        });

        ['UNKNOWN', 'decommissioned-mode', 'typo_mnaufacturing'].forEach((input) => {
            expect(normalizeBackendWorkflowMode(input)).toBe('msme');
            expect(normalizeFrontendWorkflowMode(input)).toBe('msme');
        });
    });

    it('normalizes legacy manufacturing to food manufacturing and isolates services capabilities', () => {
        expect(normalizeBackendWorkflowMode('manufacturing')).toBe('food_manufacturing');
        expect(normalizeFrontendWorkflowMode('manufacturing')).toBe('food_manufacturing');
        expect(backendLabels.manufacturing).toBe('Food Manufacturing');
        expect(frontendModeHasCapability('services', 'services')).toBe(true);
        expect(backendModeHasCapability('services', 'productionWorkflows')).toBe(false);
        expect(frontendModeHasCapability('food_manufacturing', 'productionWorkflows')).toBe(true);
        expect(backendModeHasCapability('food_manufacturing', 'services')).toBe(false);
    });

    it('keeps Food & Beverage mode restaurant-native and out of manufacturing production workflows', () => {
        expect(backendLabels.fnb).toBe('Food & Beverage');
        expect(frontendLabels.fnb).toBe('Food & Beverage');
        expect(backendModeHasCapability('fnb', 'fnbDining')).toBe(true);
        expect(backendModeHasCapability('fnb', 'menuModifiers')).toBe(true);
        expect(backendModeHasCapability('fnb', 'tableService')).toBe(true);
        expect(backendModeHasCapability('fnb', 'kitchenQueue')).toBe(true);
        expect(backendModeHasCapability('fnb', 'restaurantServiceCharge')).toBe(true);
        expect(backendModeHasCapability('fnb', 'productionWorkflows')).toBe(false);
        expect(frontendModeHasCapability('fnb', 'fnbDining')).toBe(true);
        expect(frontendModeHasCapability('fnb', 'productionWorkflows')).toBe(false);
    });

    it('keeps Hospitality mode PMS-native and out of manufacturing, F&B, and Services booking workflows', () => {
        expect(backendLabels.hospitality).toBe('Hospitality');
        expect(frontendLabels.hospitality).toBe('Hospitality');
        expect(backendModeHasCapability('hospitality', 'hospitalityReservations')).toBe(true);
        expect(backendModeHasCapability('hospitality', 'hospitalityRooms')).toBe(true);
        expect(backendModeHasCapability('hospitality', 'hospitalityHousekeeping')).toBe(true);
        expect(backendModeHasCapability('hospitality', 'hospitalityMaintenance')).toBe(true);
        expect(backendModeHasCapability('hospitality', 'hospitalityFolios')).toBe(true);
        expect(backendModeHasCapability('hospitality', 'hospitalityRates')).toBe(true);
        expect(backendModeHasCapability('hospitality', 'hospitalityAmenities')).toBe(true);
        expect(backendModeHasCapability('hospitality', 'productionWorkflows')).toBe(false);
        expect(backendModeHasCapability('hospitality', 'fnbDining')).toBe(false);
        expect(backendModeHasCapability('hospitality', 'services')).toBe(false);
        expect(frontendModeHasCapability('hospitality', 'hospitalityReservations')).toBe(true);
        expect(frontendModeHasCapability('hospitality', 'productionWorkflows')).toBe(false);
        expect(frontendModeHasCapability('hospitality', 'fnbDining')).toBe(false);
        expect(frontendModeHasCapability('hospitality', 'services')).toBe(false);
    });

    describe('Phase 6 composed enabled_capabilities overlay', () => {
        it('keeps the capability vocabulary and setting key aligned across layers', () => {
            expect(frontendAllCapabilities).toEqual(backendAllCapabilities);
            expect(frontendEnabledCapabilitiesKey).toBe(backendEnabledCapabilitiesKey);
            expect(backendEnabledCapabilitiesKey).toBe('ops_enabled_capabilities');
        });

        it('leaves modeHasCapability byte-identical for callers that pass no overlay', () => {
            expect(backendModeHasCapability('retail', 'services')).toBe(false);
            expect(frontendModeHasCapability('retail', 'services')).toBe(false);
            expect(backendModeHasCapability('retail', 'catalog')).toBe(true);
            expect(frontendModeHasCapability('retail', 'catalog')).toBe(true);
        });

        it('grants an overlay capability on top of the base mode without altering the base list', () => {
            expect(backendModeHasCapability('retail', 'services', ['services'])).toBe(true);
            expect(frontendModeHasCapability('retail', 'services', ['services'])).toBe(true);
            // The base mode's own fixed capabilities are untouched by the overlay.
            expect(backendModeHasCapability('retail', 'catalog', ['services'])).toBe(true);
            expect(backendModeHasCapability('services', 'foodManufacturing', ['services'])).toBe(false);
        });

        it('silently drops unknown/decommissioned capability strings from the overlay', () => {
            const overlay = ['services', 'not-a-real-capability', ''];
            expect(normalizeBackendEnabledCapabilities(overlay)).toEqual(['services']);
            expect(normalizeFrontendEnabledCapabilities(overlay)).toEqual(['services']);
            expect(backendModeHasCapability('retail', 'not-a-real-capability', overlay)).toBe(false);
        });

        it('resolves the effective capability set as the union of base mode and overlay identically across layers', () => {
            const backendEffective = resolveBackendEffectiveCapabilities('retail', ['services', 'fnbDining']);
            const frontendEffective = resolveFrontendEffectiveCapabilities('retail', ['services', 'fnbDining']);
            expect(frontendEffective).toEqual(backendEffective);
            expect([...backendEffective].sort()).toEqual(
                [...new Set(['catalog', 'inventory', 'menuModifiers', 'pos', 'storefront', 'services', 'fnbDining'])].sort()
            );
        });

        it('resolves to exactly the base mode capabilities when no overlay is configured', () => {
            expect(resolveBackendEffectiveCapabilities('fnb')).toEqual(
                resolveBackendEffectiveCapabilities('fnb', [])
            );
            expect(resolveBackendEffectiveCapabilities('fnb', undefined)).toEqual(
                resolveBackendEffectiveCapabilities('fnb', [])
            );
        });
    });
});
