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
import { resolveEffectiveItemTaxonomy } from '../src/modules/shared/constants/modeItemTaxonomy.js';
import { STOREFRONT_ORDER_METHODS, POS_ORDER_METHODS } from '../src/modules/shared/constants/orderMethods.js';
// Imported through the frontend path deliberately: the harness proves the
// profile materializes exactly what the admin POS terminal resolves.
import { resolvePosWorkflow } from '../../frontend/src/features/pos/utils/posWorkflowResolver.js';

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

    it('applies the enabled-capabilities overlay exactly as the runtime does', () => {
        const profile = buildStoreProfile({ workflowMode: 'retail', enabledCapabilities: ['services'] });
        expect(profile.modules).toEqual([...resolveEffectiveCapabilities('retail', ['services'])].sort());
        expect(profile.source.enabled_capabilities).toEqual(['services']);
        // Overlay unlocks the services item presets on a retail base.
        const overlayTaxonomy = resolveEffectiveItemTaxonomy('retail', ['services']);
        expect(profile.item_taxonomy.preset_keys).toEqual(overlayTaxonomy.presets.map((preset) => preset.key));
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
