export const POS_TAXPAYER_TYPE_SETTING_KEY = 'pos_taxpayer_type';

export const POS_TAXPAYER_TYPE_VALUES = Object.freeze([
    'vat_registered',
    'non_vat_registered'
]);

const TAXPAYER_TYPE_ALIASES = Object.freeze({
    vat: 'vat_registered',
    vat_registered: 'vat_registered',
    vatregistration: 'vat_registered',
    vat_registration: 'vat_registered',
    vatregistered: 'vat_registered',
    non_vat: 'non_vat_registered',
    non_vat_registered: 'non_vat_registered',
    non_vat_registration: 'non_vat_registered',
    non_vatregistered: 'non_vat_registered',
    nonvat: 'non_vat_registered',
    nonvat_registered: 'non_vat_registered',
    nonvatregistration: 'non_vat_registered',
    nonvatregistered: 'non_vat_registered'
});

export const POS_TAXPAYER_TYPE_INPUT_VALUES = Object.freeze(Object.keys(TAXPAYER_TYPE_ALIASES));

const normalizeInput = (value) => String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_');

export const resolvePosTaxpayerType = (value) => (
    TAXPAYER_TYPE_ALIASES[normalizeInput(value)] || null
);

export const isRecognizedPosTaxpayerType = (value) => Boolean(resolvePosTaxpayerType(value));

export const getPosTaxpayerTypeReadiness = (value) => {
    const rawValue = String(value ?? '').trim();
    if (!rawValue) {
        return {
            status: 'not_configured',
            taxpayer_type: null,
            reason_code: 'POS_TAXPAYER_TYPE_NOT_CONFIGURED'
        };
    }

    const taxpayerType = resolvePosTaxpayerType(rawValue);
    if (!taxpayerType) {
        return {
            status: 'needs_review',
            taxpayer_type: null,
            reason_code: 'POS_TAXPAYER_TYPE_UNRECOGNIZED'
        };
    }

    return {
        status: 'configured',
        taxpayer_type: taxpayerType,
        reason_code: null
    };
};
