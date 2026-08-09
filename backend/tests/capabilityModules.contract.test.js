import {
    CAPABILITY_MODULES,
    ALL_CAPABILITY_MODULE_KEYS,
    SHIPPED_GATE_MODULE_KEYS,
    CAPABILITY_MODULE_VOCABULARY_ALIGNED,
    STORE_TEMPLATE_PRESETS,
    resolveModeModuleBundle,
    validateModuleSelection
} from '../src/modules/shared/constants/capabilityModules.js';
import {
    WORKFLOW_MODE_CAPABILITIES,
    ALL_WORKFLOW_CAPABILITIES,
    normalizeEnabledCapabilities,
    resolveEffectiveCapabilities
} from '../src/modules/shared/constants/workflowModes.js';

describe('capability module catalog contracts', () => {
    it('keeps the catalog and the enforced capability vocabulary in lockstep', () => {
        // Every workflow capability is a catalog module, and every shipped
        // gate module is a workflow capability — the catalog adds metadata,
        // never new enforceable vocabulary.
        expect(CAPABILITY_MODULE_VOCABULARY_ALIGNED.capability_keys_missing_from_catalog).toEqual([]);
        expect(CAPABILITY_MODULE_VOCABULARY_ALIGNED.shipped_gate_modules_outside_capability_vocabulary).toEqual([]);
        expect([...SHIPPED_GATE_MODULE_KEYS].sort()).toEqual([...ALL_WORKFLOW_CAPABILITIES].sort());
    });

    it('resolves every mode to a bundle byte-identical to resolveEffectiveCapabilities', () => {
        // Phase 10 is metadata-only: the catalog must introduce zero behavior.
        for (const mode of Object.keys(WORKFLOW_MODE_CAPABILITIES)) {
            expect(resolveModeModuleBundle(mode)).toEqual(resolveEffectiveCapabilities(mode));
            expect(resolveModeModuleBundle(mode, ['services'])).toEqual(
                resolveEffectiveCapabilities(mode, ['services'])
            );
        }
    });

    it('keeps every mode bundle closed under the requires graph', () => {
        for (const [mode, capabilities] of Object.entries(WORKFLOW_MODE_CAPABILITIES)) {
            const result = validateModuleSelection(capabilities);
            expect({ mode, ...result }).toEqual({
                mode,
                ok: true,
                unknown: [],
                unbuildable: [],
                missing_requirements: [],
                conflicts: []
            });
        }
    });

    it('keeps every template preset valid and every canonical preset behavior-identical to its base mode', () => {
        for (const [key, preset] of Object.entries(STORE_TEMPLATE_PRESETS)) {
            const result = validateModuleSelection(preset.modules);
            expect({ preset: key, ok: result.ok }).toEqual({ preset: key, ok: true });

            if (preset.canonical) {
                expect([...preset.modules].sort()).toEqual(
                    [...WORKFLOW_MODE_CAPABILITIES[preset.base_mode]].sort()
                );
            }
        }
    });

    it('keeps planned modules out of the grantable capability vocabulary', () => {
        const plannedKeys = ALL_CAPABILITY_MODULE_KEYS.filter(
            (key) => CAPABILITY_MODULES[key].status === 'planned'
        );

        expect(plannedKeys.length).toBeGreaterThan(0);
        for (const key of plannedKeys) {
            expect(ALL_WORKFLOW_CAPABILITIES).not.toContain(key);
        }
        // The overlay normalizer silently drops them, so a planned module can
        // never be granted through ops_enabled_capabilities.
        expect(normalizeEnabledCapabilities(plannedKeys)).toEqual([]);
    });

    it('rejects selections that violate the requires graph', () => {
        const missingBase = validateModuleSelection(['tableService']);
        expect(missingBase.ok).toBe(false);
        expect(missingBase.missing_requirements).toEqual([
            { module: 'tableService', requires: 'fnbDining' }
        ]);

        const planned = validateModuleSelection(['services', 'catalog', 'laborTracking']);
        expect(planned.ok).toBe(false);
        expect(planned.unbuildable).toEqual(['laborTracking']);

        const unknown = validateModuleSelection(['not_a_module']);
        expect(unknown.ok).toBe(false);
        expect(unknown.unknown).toEqual(['not_a_module']);
    });
});
