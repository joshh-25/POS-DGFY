export const DEFAULT_WORKFLOW_MODE = 'manufacturing';

export const WORKFLOW_MODE_VALUES = Object.freeze(['manufacturing', 'msme']);

export const normalizeWorkflowMode = (value) => {
    const normalized = String(value || '').trim().toLowerCase();
    if (WORKFLOW_MODE_VALUES.includes(normalized)) {
        return normalized;
    }
    return DEFAULT_WORKFLOW_MODE;
};

export const isWorkflowMode = (value) => (
    WORKFLOW_MODE_VALUES.includes(String(value || '').trim().toLowerCase())
);
