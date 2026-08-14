import {
    STORE_PROFILE_VERSION,
    buildStoreProfile,
    storeProfilesEqual
} from '../src/modules/shared/constants/storeProfile.js';
import {
    WORKFLOW_MODE_CAPABILITIES,
    resolveEffectiveCapabilities,
    resolveWorkflowModeFamily
} from '../src/modules/shared/constants/workflowModes.js';
import { STORE_TEMPLATE_PRESETS, validateModuleSelection } from '../src/modules/shared/constants/capabilityModules.js';
import { resolveEffectiveItemTaxonomy } from '../src/modules/shared/constants/modeItemTaxonomy.js';
import { STOREFRONT_ORDER_METHODS, POS_ORDER_METHODS } from '../src/modules/shared/constants/orderMethods.js';
// Imported through the frontend path deliberately: the harness proves the
// profile materializes exactly what the admin POS terminal resolves.
import { resolvePosWorkflow } from '../../../packages/web-core/src/features/pos/utils/posWorkflowResolver.js';
import {
    POS_DEFAULTS_AND_TERMINOLOGY_VOCABULARY_ALIGNED,
    resolvePosDefaultsAndTerminology
} from '../src/modules/shared/constants/posDefaultsAndTerminology.js';

const ALL_MODES = Object.keys(WORKFLOW_MODE_CAPABILITIES);

describe('store profile equivalence harness (issue #178 Phase 11)', () => {
    it('materializes modules byte-identical to resolveEffectiveCapabilities for every mode', () => {
        for (const mode of ALL_MODES) {
            const profile = buildStoreProfile({ workflowMode: mode });
            expect(profile.modules).toEqual([...resolveEffectiveCapabilities(mode)].sort());
            expect(profile.profile_version).toBe(STORE_PROFILE_VERSION);
            expect(profile.source.base_mode).toBe(mode === 'manufacturing' ? 'food_manufacturing' : mode);
            expect(profile.source.family).toBe(resolveWorkflowModeFamily(mode));
        }
    });

    it('materializes the POS workflow byte-identical to what the terminal resolver produces', () => {
        for (const mode of ALL_MODES) {
            const profile = buildStoreProfile({ workflowMode: mode });
            const terminalConfig = resolvePosWorkflow(mode);

            expect(profile.pos_workflow).toEqual({
                mode: terminalConfig.mode,
                transaction_record: terminalConfig.transactionRecord,
                allowed_methods: [...terminalConfig.allowedMethods],
                capabilities: { ...terminalConfig.capabilities }
            });
            // And the terminal never offers a method the DB enum cannot hold.
            for (const method of profile.pos_workflow.allowed_methods) {
                expect(POS_ORDER_METHODS).toContain(method);
            }
        }
    });

    it('materializes the item taxonomy byte-identical to resolveEffectiveItemTaxonomy', () => {
        for (const mode of ALL_MODES) {
            const profile = buildStoreProfile({ workflowMode: mode });
            const taxonomy = resolveEffectiveItemTaxonomy(mode);

            if (!taxonomy) {
                expect(profile.item_taxonomy).toBeNull();
                continue;
            }
            expect(profile.item_taxonomy).toEqual({
                mode: taxonomy.mode,
                default_preset: taxonomy.default_preset,
                preset_keys: taxonomy.presets.map((preset) => preset.key)
            });
        }
    });

    it('materializes the storefront order methods from the shared vocabulary', () => {
        const profile = buildStoreProfile({ workflowMode: 'retail' });
        expect(profile.storefront.order_methods).toEqual([...STOREFRONT_ORDER_METHODS]);
    });

    it('has a pos_defaults/terminology entry for every real workflow mode and none outside it', () => {
        expect(POS_DEFAULTS_AND_TERMINOLOGY_VOCABULARY_ALIGNED.modes_missing_entry).toEqual([]);
        expect(POS_DEFAULTS_AND_TERMINOLOGY_VOCABULARY_ALIGNED.entries_outside_mode_vocabulary).toEqual([]);
    });

    it('materializes pos_defaults and terminology byte-identical to resolvePosDefaultsAndTerminology (issue #178 Phase 18)', () => {
        // Prior to Phase 18 this cross-checked against a second, independent
        // frontend copy (businessModeTemplates.js's posDefaults/wizardLabels
        // fields). That copy is now retired - TerminalPage.jsx reads
        // profile.pos_defaults directly instead of recomputing it - so the
        // only remaining source of truth is this registry, which
        // buildStoreProfile itself calls. Kept as a wiring/golden-value pin,
        // not a cross-implementation check.
        for (const mode of ALL_MODES) {
            const profile = buildStoreProfile({ workflowMode: mode });
            const expected = resolvePosDefaultsAndTerminology(mode);
            expect(profile.pos_defaults).toEqual(expected.pos_defaults);
            expect(profile.terminology).toEqual(expected.terminology);
        }
    });

    it('keeps Services bookings out of the retail/F&B online Orders queue default', () => {
        const servicesProfile = buildStoreProfile({ workflowMode: 'services' });
        const fnbProfile = buildStoreProfile({ workflowMode: 'fnb' });
        const retailProfile = buildStoreProfile({ workflowMode: 'retail' });

        expect(servicesProfile.pos_defaults.show_online_queue).toBe(false);
        expect(fnbProfile.pos_defaults.show_online_queue).toBe(true);
        expect(retailProfile.pos_defaults.show_online_queue).toBe(true);
    });

    it('applies the enabled-capabilities overlay exactly as the runtime does', () => {
        const profile = buildStoreProfile({ workflowMode: 'retail', enabledCapabilities: ['services'] });
        expect(profile.modules).toEqual([...resolveEffectiveCapabilities('retail', ['services'])].sort());
        expect(profile.source.enabled_capabilities).toEqual(['services']);
        // Overlay unlocks the services item presets on a retail base.
        const overlayTaxonomy = resolveEffectiveItemTaxonomy('retail', ['services']);
        expect(profile.item_taxonomy.preset_keys).toEqual(overlayTaxonomy.presets.map((preset) => preset.key));
    });

    it('applies the disabled-capabilities overlay exactly as the runtime does (issue #178 Phase 16)', () => {
        const profile = buildStoreProfile({ workflowMode: 'fnb', disabledCapabilities: ['tableService', 'kitchenQueue'] });
        expect(profile.modules).toEqual(
            [...resolveEffectiveCapabilities('fnb', [], ['tableService', 'kitchenQueue'])].sort()
        );
        expect(profile.source.disabled_capabilities).toEqual(['kitchenQueue', 'tableService']);
        expect(profile.modules).not.toContain('tableService');
        expect(profile.modules).not.toContain('kitchenQueue');
    });

    it('has an empty disabled_capabilities and unchanged modules when no disabled overlay is given (zero-behavior-change baseline)', () => {
        for (const mode of ALL_MODES) {
            const profile = buildStoreProfile({ workflowMode: mode });
            expect(profile.source.disabled_capabilities).toEqual([]);
            expect(profile.modules).toEqual([...resolveEffectiveCapabilities(mode)].sort());
        }
    });

    it('reproduces the non-canonical fnb_counter_service and hospitality_guesthouse presets exactly via subtraction', () => {
        const counterService = STORE_TEMPLATE_PRESETS.fnb_counter_service;
        const counterServiceProfile = buildStoreProfile({
            workflowMode: counterService.base_mode,
            disabledCapabilities: WORKFLOW_MODE_CAPABILITIES[counterService.base_mode]
                .filter((capability) => !counterService.modules.includes(capability))
        });
        expect(counterServiceProfile.modules).toEqual([...counterService.modules].sort());

        const guesthouse = STORE_TEMPLATE_PRESETS.hospitality_guesthouse;
        const guesthouseProfile = buildStoreProfile({
            workflowMode: guesthouse.base_mode,
            disabledCapabilities: WORKFLOW_MODE_CAPABILITIES[guesthouse.base_mode]
                .filter((capability) => !guesthouse.modules.includes(capability))
        });
        expect(guesthouseProfile.modules).toEqual([...guesthouse.modules].sort());
    });

    it('resolves the counter-service POS workflow for a store that subtracted both dining-floor capabilities (issue #178 Phase 21)', () => {
        const counterService = STORE_TEMPLATE_PRESETS.fnb_counter_service;
        const counterServiceProfile = buildStoreProfile({
            workflowMode: counterService.base_mode,
            disabledCapabilities: WORKFLOW_MODE_CAPABILITIES[counterService.base_mode]
                .filter((capability) => !counterService.modules.includes(capability))
        });
        expect(counterServiceProfile.pos_workflow.mode).toBe('counter');
        expect(counterServiceProfile.pos_workflow.capabilities.tables).toBe(false);
        expect(counterServiceProfile.pos_workflow.capabilities.kitchen).toBe(false);

        // A full-service fnb store (nothing subtracted) still gets the full
        // fnb workflow - this is the zero-behavior-change control case.
        const fullServiceProfile = buildStoreProfile({ workflowMode: 'fnb' });
        expect(fullServiceProfile.pos_workflow.mode).toBe('fnb');
        expect(fullServiceProfile.pos_workflow.capabilities.tables).toBe(true);
        expect(fullServiceProfile.pos_workflow.capabilities.kitchen).toBe(true);

        // Hospitality never carries tableService/kitchenQueue in its own
        // base list, so it must not be swept into counter mode by a
        // family-blind version of this rule.
        const hospitalityProfile = buildStoreProfile({ workflowMode: 'hospitality' });
        expect(hospitalityProfile.pos_workflow.mode).toBe('fnb');
    });

    it('drops item taxonomy for a capability that was additively enabled and then subtracted (issue #178 Phase 21)', () => {
        // Before Phase 21, item_taxonomy read only the raw enabled overlay,
        // so a tenant that enabled 'services' and later disabled it again
        // still carried services item-taxonomy presets forever - the
        // additive-only bug this test pins shut.
        const stillEnabledProfile = buildStoreProfile({
            workflowMode: 'retail',
            enabledCapabilities: ['services']
        });
        expect(stillEnabledProfile.item_taxonomy.preset_keys).toEqual(
            resolveEffectiveItemTaxonomy('retail', ['services']).presets.map((preset) => preset.key)
        );

        const subtractedAgainProfile = buildStoreProfile({
            workflowMode: 'retail',
            enabledCapabilities: ['services'],
            disabledCapabilities: ['services']
        });
        const retailOnlyTaxonomy = resolveEffectiveItemTaxonomy('retail', []);
        expect(subtractedAgainProfile.item_taxonomy.preset_keys).toEqual(
            retailOnlyTaxonomy.presets.map((preset) => preset.key)
        );
        expect(subtractedAgainProfile.item_taxonomy.preset_keys).not.toEqual(
            stillEnabledProfile.item_taxonomy.preset_keys
        );
    });

    it('rejects a subtraction that breaks a requires edge (validateModuleSelection stays the write-time guard)', () => {
        // pos requires catalog; disabling catalog while pos stays enabled must
        // be caught by validateModuleSelection before a write can persist it.
        const brokenSelection = resolveEffectiveCapabilities('retail', [], ['catalog']);
        expect(brokenSelection).toContain('pos');
        expect(brokenSelection).not.toContain('catalog');
        const validation = validateModuleSelection(brokenSelection);
        expect(validation.ok).toBe(false);
        expect(validation.missing_requirements).toEqual(
            expect.arrayContaining([{ module: 'pos', requires: 'catalog' }])
        );
    });

    it('is deterministic: identical inputs produce byte-identical JSON', () => {
        const first = buildStoreProfile({ workflowMode: 'fnb', enabledCapabilities: ['services'] });
        const second = buildStoreProfile({ workflowMode: 'fnb', enabledCapabilities: ['services'] });
        expect(storeProfilesEqual(first, second)).toBe(true);
        expect(JSON.stringify(first)).toBe(JSON.stringify(second));
    });

    it('matches the golden per-mode snapshots (zero-visible-behavior-change baseline)', () => {
        for (const mode of ALL_MODES) {
            expect(buildStoreProfile({ workflowMode: mode })).toMatchSnapshot(mode);
        }
    });
});
