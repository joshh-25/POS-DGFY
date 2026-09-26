export const POS_TAX_POLICY_TYPES = Object.freeze([
  'senior',
  'pwd',
  'manual',
  'employee',
  'promo',
  'voucher'
]);

export const POS_TAX_POLICY_TYPE_LABELS = Object.freeze({
  senior: 'Senior Citizen',
  pwd: 'PWD',
  manual: 'Others',
  employee: 'Employee',
  promo: 'Promo',
  voucher: 'Voucher'
});

export const POS_TAX_TREATMENT_OPTIONS = Object.freeze([
  {
    value: 'standard',
    label: 'Keep item VAT',
    description: 'Use the VAT already included in the item price.'
  },
  {
    value: 'vat_exempt',
    label: 'Remove embedded VAT',
    description: 'Remove the embedded VAT before applying the discount.'
  }
]);

const DEFAULT_VAT_TREATMENT_BY_TYPE = Object.freeze({
  senior: 'vat_exempt',
  pwd: 'vat_exempt',
  manual: 'standard',
  employee: 'standard',
  promo: 'standard',
  voucher: 'standard'
});

const isObject = (value) => value && typeof value === 'object' && !Array.isArray(value);

export const createDefaultPosTaxPolicies = () => ({
  version: 1,
  categories: POS_TAX_POLICY_TYPES.reduce((categories, type) => ({
    ...categories,
    [type]: { vat_treatment: DEFAULT_VAT_TREATMENT_BY_TYPE[type] }
  }), {})
});

export const normalizePosTaxPolicies = (raw) => {
  const fallback = createDefaultPosTaxPolicies();
  const unwrapped = isObject(raw?.value) ? raw.value : raw;
  const source = isObject(unwrapped) ? unwrapped : {};
  const sourceCategories = isObject(source.categories) ? source.categories : source;
  const version = Number.parseInt(source.version, 10);

  return {
    version: Number.isInteger(version) && version > 0 ? version : fallback.version,
    categories: POS_TAX_POLICY_TYPES.reduce((categories, type) => {
      const requestedTreatment = String(sourceCategories?.[type]?.vat_treatment || '').trim().toLowerCase();
      return {
        ...categories,
        [type]: {
          vat_treatment: requestedTreatment === 'vat_exempt' || requestedTreatment === 'standard'
            ? requestedTreatment
            : fallback.categories[type].vat_treatment
        }
      };
    }, {})
  };
};
export const getPosTaxPoliciesSnapshot = (raw) => {
  const normalized = normalizePosTaxPolicies(raw);
  return {
    categories: POS_TAX_POLICY_TYPES.reduce((categories, type) => ({
      ...categories,
      [type]: normalized.categories[type].vat_treatment
    }), {})
  };
};
