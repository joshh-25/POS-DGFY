export const POS_TAX_POLICY_SETTING_KEY = 'pos_tax_policies';
export const POS_TAX_POLICY_VERSION = 1;

export const POS_TAX_POLICY_TYPES = Object.freeze([
    'senior',
    'pwd',
    'manual',
    'employee',
    'promo',
    'voucher'
]);

export const POS_TAX_TREATMENTS = Object.freeze([
    'standard',
    'vat_exempt'
]);

export const POS_TAX_POLICY_DEFAULTS = Object.freeze({
    version: POS_TAX_POLICY_VERSION,
    categories: Object.freeze({
        senior: Object.freeze({ vat_treatment: 'vat_exempt' }),
        pwd: Object.freeze({ vat_treatment: 'vat_exempt' }),
        manual: Object.freeze({ vat_treatment: 'standard' }),
        employee: Object.freeze({ vat_treatment: 'standard' }),
        promo: Object.freeze({ vat_treatment: 'standard' }),
        voucher: Object.freeze({ vat_treatment: 'standard' })
    })
});

const isPlainObject = (value) => value !== null
    && typeof value === 'object'
    && !Array.isArray(value);

const normalizeTreatment = (value, fallback) => {
    const normalized = String(value || '').trim().toLowerCase();
    return POS_TAX_TREATMENTS.includes(normalized) ? normalized : fallback;
};

export const normalizePosTaxPolicies = (value) => {
    const source = isPlainObject(value) ? value : {};
    const sourceCategories = isPlainObject(source.categories) ? source.categories : source;
    const categories = {};

    POS_TAX_POLICY_TYPES.forEach((type) => {
        const fallback = POS_TAX_POLICY_DEFAULTS.categories[type].vat_treatment;
        categories[type] = {
            vat_treatment: normalizeTreatment(sourceCategories?.[type]?.vat_treatment, fallback)
        };
    });

    const requestedVersion = Number.parseInt(source.version, 10);
    return {
        version: Number.isInteger(requestedVersion) && requestedVersion > 0
            ? requestedVersion
            : POS_TAX_POLICY_VERSION,
        categories
    };
};

export const resolvePosTaxPolicy = (value, type) => {
    const normalized = normalizePosTaxPolicies(value);
    const normalizedType = String(type || '').trim().toLowerCase();
    const fallback = POS_TAX_POLICY_DEFAULTS.categories[normalizedType]
        || POS_TAX_POLICY_DEFAULTS.categories.manual;
    return {
        version: normalized.version,
        type: normalizedType || 'manual',
        vat_treatment: normalized.categories[normalizedType]?.vat_treatment
            || fallback.vat_treatment
    };
};

export const shouldRemovePosTaxVat = (value, type) => (
    resolvePosTaxPolicy(value, type).vat_treatment === 'vat_exempt'
);
