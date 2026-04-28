import {
    DEFAULT_WORKFLOW_MODE as backendDefaultMode,
    WORKFLOW_MODE_LABELS as backendLabels,
    WORKFLOW_MODE_VALUES as backendValues,
    normalizeWorkflowMode as normalizeBackendWorkflowMode,
    resolveWorkflowModeFamily as resolveBackendWorkflowModeFamily,
    resolveWorkflowTemplateMode as resolveBackendWorkflowTemplateMode
} from '../src/modules/shared/constants/workflowModes.js';
import {
    DEFAULT_WORKFLOW_MODE as frontendDefaultMode,
    WORKFLOW_MODE_LABELS as frontendLabels,
    WORKFLOW_MODE_VALUES as frontendValues,
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

    it('resolves normalization, mode family, and template family identically across layers', () => {
        const unknownModeInputs = ['UNKNOWN', '', null, undefined, '  retail  ', 'msme', 'FNB', 'education_institutions'];

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
});
