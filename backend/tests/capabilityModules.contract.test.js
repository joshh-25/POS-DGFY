import {
    CAPABILITY_MODULES,
    CAPABILITY_MODULE_SURFACES,
    CAPABILITY_MODULE_GROUPS,
    MODE_FAMILY_MODULE_GROUPS,
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
    WORKFLOW_MODE_ENGINE,
    WORKFLOW_MODE_ENGINE_VALUES,
    WORKFLOW_MODE_ENGINE_NOTES,
    TEMPLATE_AUTHORABLE_MODES,
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

// issue #178 final-touch pass: pins the native/transitional/external engine
// classification (workflowModes.js) that backs the admin curation UI's
// "which base modes can I author a template against" and "which modes are
// natively run by DGFY" distinctions.
describe('engine classification contracts', () => {
    it('gives every workflow mode value an engine classification, with aliases mirroring their target', () => {
        expect(Object.keys(WORKFLOW_MODE_ENGINE).sort()).toEqual([...WORKFLOW_MODE_VALUES].sort());
        for (const mode of WORKFLOW_MODE_VALUES) {
            expect(WORKFLOW_MODE_ENGINE_VALUES).toContain(WORKFLOW_MODE_ENGINE[mode]);
        }
        for (const [alias, target] of Object.entries(WORKFLOW_MODE_ALIASES)) {
            expect(WORKFLOW_MODE_ENGINE[alias]).toBe(WORKFLOW_MODE_ENGINE[target]);
        }
    });

    it('pins the current native/transitional/external membership', () => {
        const offeredModes = WORKFLOW_MODE_VALUES.filter((mode) => !(mode in WORKFLOW_MODE_ALIASES));
        const byEngine = (engine) => offeredModes.filter((mode) => WORKFLOW_MODE_ENGINE[mode] === engine).sort();

        expect(byEngine('external')).toEqual(
            [...STORE_TEMPLATE_PRESETLESS_MODES].sort()
        );
        expect(byEngine('transitional')).toEqual(['food_manufacturing', 'hospitality']);
        expect(byEngine('native')).toEqual(['fnb', 'msme', 'retail', 'services']);
    });

    it('keeps external modes a subset of the intentionally preset-less modes', () => {
        // Not equality: a transitional mode flipping to external later keeps
        // its seeded presets until a separate product decision retires them
        // (see the doc comment above WORKFLOW_MODE_ENGINE).
        const externalModes = WORKFLOW_MODE_VALUES.filter(
            (mode) => !(mode in WORKFLOW_MODE_ALIASES) && WORKFLOW_MODE_ENGINE[mode] === 'external'
        );
        for (const mode of externalModes) {
            expect(STORE_TEMPLATE_PRESETLESS_MODES).toContain(mode);
        }
    });

    it('gives every transitional mode a planned-engine note', () => {
        const transitionalModes = WORKFLOW_MODE_VALUES.filter(
            (mode) => WORKFLOW_MODE_ENGINE[mode] === 'transitional'
        );
        expect(transitionalModes.length).toBeGreaterThan(0);
        for (const mode of transitionalModes) {
            expect(typeof WORKFLOW_MODE_ENGINE_NOTES[mode]).toBe('string');
            expect(WORKFLOW_MODE_ENGINE_NOTES[mode].length).toBeGreaterThan(0);
        }
    });

    it('makes every native and transitional offered mode authorable, and every external mode not', () => {
        const offeredModes = WORKFLOW_MODE_VALUES.filter((mode) => !(mode in WORKFLOW_MODE_ALIASES));
        const expectedAuthorable = offeredModes.filter((mode) => WORKFLOW_MODE_ENGINE[mode] !== 'external').sort();

        expect([...TEMPLATE_AUTHORABLE_MODES].sort()).toEqual(expectedAuthorable);
        expect(TEMPLATE_AUTHORABLE_MODES).toContain('hospitality');
        expect(TEMPLATE_AUTHORABLE_MODES).toContain('food_manufacturing');
        expect(TEMPLATE_AUTHORABLE_MODES).not.toContain('manufacturing');
        for (const mode of STORE_TEMPLATE_PRESETLESS_MODES) {
            expect(TEMPLATE_AUTHORABLE_MODES).not.toContain(mode);
        }
    });
});

// issue #178 final-touch pass: pins the module description/surface/group
// metadata and the per-mode-family curation grid filter that the admin UX
// overhaul reads.
describe('module curation metadata contracts', () => {
    const selectableKeys = ALL_CAPABILITY_MODULE_KEYS.filter((key) => {
        const module = CAPABILITY_MODULES[key];
        return module.status === 'shipped' && module.enforcement !== 'locked';
    });

    it('has at least one selectable (shipped, non-locked) module', () => {
        expect(selectableKeys.length).toBeGreaterThan(0);
    });

    it('gives every selectable module a non-empty description, a valid surface, and a valid group', () => {
        const surfaceValues = Object.values(CAPABILITY_MODULE_SURFACES);
        const groupKeys = Object.keys(CAPABILITY_MODULE_GROUPS);

        for (const key of selectableKeys) {
            const module = CAPABILITY_MODULES[key];
            expect(typeof module.description).toBe('string');
            expect(module.description.length).toBeGreaterThan(0);
            expect(surfaceValues).toContain(module.surface);
            expect(groupKeys).toContain(module.group);
        }
    });

    it('keeps every MODE_FAMILY_MODULE_GROUPS entry referencing only valid groups, always including universal', () => {
        const groupKeys = Object.keys(CAPABILITY_MODULE_GROUPS);
        for (const [family, groups] of Object.entries(MODE_FAMILY_MODULE_GROUPS)) {
            expect(groups).toContain('universal');
            for (const group of groups) {
                expect({ family, group, valid: groupKeys.includes(group) }).toEqual({ family, group, valid: true });
            }
        }
    });

    it('covers every de-aliased offered mode with a MODE_FAMILY_MODULE_GROUPS entry', () => {
        const offeredModes = Object.keys(WORKFLOW_MODE_CAPABILITIES).filter((mode) => !(mode in WORKFLOW_MODE_ALIASES));
        for (const mode of offeredModes) {
            expect(Object.keys(MODE_FAMILY_MODULE_GROUPS)).toContain(mode);
        }
    });
});
