export const DEFAULT_WORKFLOW_MODE = 'manufacturing';

export const WORKFLOW_MODE_VALUES = Object.freeze([
    'retail',
    'services',
    'manufacturing',
    'food_manufacturing',
    'fnb',
    'hospitality',
    'healthcare',
    'ticketing_transport',
    'logistics_distribution',
    'education_institutions',
    'msme'
]);

export const WORKFLOW_MODE_LABELS = Object.freeze({
    retail: 'Retail',
    services: 'Services',
    manufacturing: 'Manufacturing',
    food_manufacturing: 'Food Manufacturing',
    fnb: 'F&B',
    hospitality: 'Hospitality',
    healthcare: 'Healthcare',
    ticketing_transport: 'Ticketing & Transport',
    logistics_distribution: 'Logistics & Distribution',
    education_institutions: 'Education & Institutions',
    msme: 'Simple (MSME)'
});

const WORKFLOW_MODE_FAMILY_MAP = Object.freeze({
    retail: 'manufacturing',
    services: 'manufacturing',
    manufacturing: 'manufacturing',
    food_manufacturing: 'manufacturing',
    fnb: 'manufacturing',
    hospitality: 'manufacturing',
    healthcare: 'manufacturing',
    ticketing_transport: 'manufacturing',
    logistics_distribution: 'manufacturing',
    education_institutions: 'manufacturing',
    msme: 'msme'
});

const WORKFLOW_MODE_TEMPLATE_MAP = Object.freeze({
    retail: 'manufacturing',
    services: 'manufacturing',
    manufacturing: 'manufacturing',
    food_manufacturing: 'manufacturing',
    fnb: 'manufacturing',
    hospitality: 'manufacturing',
    healthcare: 'manufacturing',
    ticketing_transport: 'manufacturing',
    logistics_distribution: 'manufacturing',
    education_institutions: 'manufacturing',
    msme: 'msme'
});

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

export const resolveWorkflowModeFamily = (value) => {
    const mode = normalizeWorkflowMode(value);
    return WORKFLOW_MODE_FAMILY_MAP[mode] || 'manufacturing';
};

export const resolveWorkflowTemplateMode = (value) => {
    const mode = normalizeWorkflowMode(value);
    return WORKFLOW_MODE_TEMPLATE_MAP[mode] || 'manufacturing';
};

export const getWorkflowModeLabel = (value) => {
    const mode = normalizeWorkflowMode(value);
    return WORKFLOW_MODE_LABELS[mode] || WORKFLOW_MODE_LABELS[DEFAULT_WORKFLOW_MODE];
};
