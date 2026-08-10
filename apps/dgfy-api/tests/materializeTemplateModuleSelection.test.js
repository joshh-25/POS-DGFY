import { materializeTemplateModuleSelection } from '../src/modules/templates/index.js';
import { WORKFLOW_MODE_CAPABILITIES, resolveEffectiveCapabilities } from '../src/modules/shared/constants/workflowModes.js';
import { STORE_TEMPLATE_PRESETS } from '../src/modules/shared/constants/capabilityModules.js';

describe('materializeTemplateModuleSelection (issue #178 Phase 17)', () => {
    it('resolves empty overlays for a canonical template (modules equals the base mode list)', () => {
        const selection = materializeTemplateModuleSelection({
            base_mode: 'retail',
            modules: [...WORKFLOW_MODE_CAPABILITIES.retail]
        });

        expect(selection.workflowMode).toBe('retail');
        expect(selection.enabledCapabilities).toEqual([]);
        expect(selection.disabledCapabilities).toEqual([]);
    });

    it('resolves a disabled overlay for a subtractive non-canonical template', () => {
        const selection = materializeTemplateModuleSelection(STORE_TEMPLATE_PRESETS.fnb_counter_service);

        expect(selection.workflowMode).toBe('fnb');
        expect(selection.enabledCapabilities).toEqual([]);
        expect(selection.disabledCapabilities).toEqual(
            ['kitchenQueue', 'restaurantServiceCharge', 'tableService'].sort()
        );
        // Applying it reproduces the preset's own module list exactly.
        const effective = resolveEffectiveCapabilities('fnb', selection.enabledCapabilities, selection.disabledCapabilities);
        expect([...effective].sort()).toEqual([...STORE_TEMPLATE_PRESETS.fnb_counter_service.modules].sort());
    });

    it('resolves an enabled overlay for an additive non-canonical template', () => {
        const selection = materializeTemplateModuleSelection(STORE_TEMPLATE_PRESETS.services_with_parts_retail);

        expect(selection.workflowMode).toBe('services');
        expect(selection.enabledCapabilities).toEqual(['inventory']);
        expect(selection.disabledCapabilities).toEqual([]);
    });

    it('reproduces the hospitality_guesthouse preset exactly via subtraction', () => {
        const selection = materializeTemplateModuleSelection(STORE_TEMPLATE_PRESETS.hospitality_guesthouse);
        const effective = resolveEffectiveCapabilities('hospitality', selection.enabledCapabilities, selection.disabledCapabilities);
        expect([...effective].sort()).toEqual([...STORE_TEMPLATE_PRESETS.hospitality_guesthouse.modules].sort());
    });

    it('handles a missing/malformed template gracefully', () => {
        expect(materializeTemplateModuleSelection(null)).toEqual({
            workflowMode: null,
            enabledCapabilities: [],
            disabledCapabilities: []
        });
        expect(materializeTemplateModuleSelection({ base_mode: 'retail' })).toEqual({
            workflowMode: 'retail',
            enabledCapabilities: [],
            disabledCapabilities: [...WORKFLOW_MODE_CAPABILITIES.retail].sort()
        });
    });
});
