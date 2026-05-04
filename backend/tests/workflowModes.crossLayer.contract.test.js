import {
    DEFAULT_WORKFLOW_MODE as backendDefaultMode,
    WORKFLOW_MODE_LABELS as backendLabels,
    WORKFLOW_MODE_PIN_META as backendPins,
    WORKFLOW_MODE_VALUES as backendValues,
    modeHasCapability as backendModeHasCapability,
    normalizeWorkflowMode as normalizeBackendWorkflowMode,
    resolveWorkflowModeFamily as resolveBackendWorkflowModeFamily,
    resolveWorkflowTemplateMode as resolveBackendWorkflowTemplateMode
} from '../src/modules/shared/constants/workflowModes.js';
import {
    DEFAULT_WORKFLOW_MODE as frontendDefaultMode,
    WORKFLOW_MODE_LABELS as frontendLabels,
    WORKFLOW_MODE_PIN_META as frontendPins,
    WORKFLOW_MODE_VALUES as frontendValues,
    modeHasCapability as frontendModeHasCapability,
    normalizeWorkflowMode as normalizeFrontendWorkflowMode,
    resolveWorkflowModeFamily as resolveFrontendWorkflowModeFamily,
    resolveWorkflowTemplateMode as resolveFrontendWorkflowTemplateMode
} from '../../frontend/src/features/settings/workflowMode.js';

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
        expect(frontendPins.food_manufacturing.icon).toBe('Factory');
    });

    it('resolves normalization, mode family, and template family identically across layers', () => {
        const unknownModeInputs = ['UNKNOWN', '', null, undefined, '  retail  ', 'msme', 'FNB', 'education_institutions', 'manufacturing', 'food_manufacturing', 'services'];

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

    it('normalizes legacy manufacturing to food manufacturing and isolates services capabilities', () => {
        expect(normalizeBackendWorkflowMode('manufacturing')).toBe('food_manufacturing');
        expect(normalizeFrontendWorkflowMode('manufacturing')).toBe('food_manufacturing');
        expect(backendLabels.manufacturing).toBe('Food Manufacturing');
        expect(frontendModeHasCapability('services', 'services')).toBe(true);
        expect(backendModeHasCapability('services', 'productionWorkflows')).toBe(false);
        expect(frontendModeHasCapability('food_manufacturing', 'productionWorkflows')).toBe(true);
        expect(backendModeHasCapability('food_manufacturing', 'services')).toBe(false);
    });
});
