import {
    CAPABILITY_MODULES,
    ALL_CAPABILITY_MODULE_KEYS,
    SHIPPED_GATE_MODULE_KEYS,
    CAPABILITY_MODULE_VOCABULARY_ALIGNED,
    STORE_TEMPLATE_PRESETS,
    STORE_TEMPLATE_PRESETLESS_MODES,
    resolveModeModuleBundle,
    validateModuleSelection
} from '../src/modules/shared/constants/capabilityModules.js';
import {
    WORKFLOW_MODE_VALUES,
    WORKFLOW_MODE_ALIASES,
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

    // issue #178 final-touch hardening: pins which registration-offered
    // modes intentionally lack a canonical preset. Mirrors the registration
    // UI's set (frontend's WORKFLOW_MODE_SELECT_VALUES) via the alias
    // exclusion, which frontend/src/features/settings/__tests__/
    // workflowMode.services.test.js pins on the frontend side.
    it('has a canonical published preset for every offered mode except the intentionally bare ones', () => {
        const offeredModes = WORKFLOW_MODE_VALUES.filter((mode) => !(mode in WORKFLOW_MODE_ALIASES));

        // Guards against the list itself drifting off the offered-mode set
        // (e.g. a rename) without anyone noticing.
        for (const bareMode of STORE_TEMPLATE_PRESETLESS_MODES) {
            expect(offeredModes).toContain(bareMode);
        }

        for (const mode of offeredModes) {
            const presetsForMode = Object.values(STORE_TEMPLATE_PRESETS).filter((preset) => preset.base_mode === mode);
            const canonicalPresetsForMode = presetsForMode.filter((preset) => preset.canonical === true);

            if (STORE_TEMPLATE_PRESETLESS_MODES.includes(mode)) {
                // Intentionally bare: zero presets of any kind (not just zero
                // canonical ones) - if someone seeds a non-canonical preset
                // for one of these four without a product decision to
                // un-bare the mode, this should fail just as loudly.
                expect({ mode, presetCount: presetsForMode.length }).toEqual({ mode, presetCount: 0 });
                // Still a real, provisionable mode - bare doesn't mean unbuilt.
                expect(WORKFLOW_MODE_CAPABILITIES[mode]).toBeDefined();
                expect(WORKFLOW_MODE_CAPABILITIES[mode].length).toBeGreaterThan(0);
            } else {
                // Every other offered mode must have exactly one canonical,
                // published-shaped preset - not zero (an unnoticed 11th mode
                // added without a preset story), not two (an ambiguous
                // provisioning default, resolved today only by template_id
                // ordering, which is exactly the fragility Phase 20 removed).
                expect({ mode, canonicalPresetCount: canonicalPresetsForMode.length }).toEqual({ mode, canonicalPresetCount: 1 });
            }
        }
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
