const toArray = (value) => (Array.isArray(value) ? value : []);

export const POS_DISCOUNT_FALLBACK_OPTIONS = Object.freeze([
    { value: 'promo', type: 'promo', label: 'Promo' },
    { value: 'voucher', type: 'voucher', label: 'Voucher' }
]);

export const normalizeAvailablePosDiscountRules = (value) => toArray(value)
    .map((rule) => {
        const ruleId = Number.parseInt(rule?.discount_rule_id ?? rule?.id, 10);
        const type = String(rule?.type || '').trim().toLowerCase();
        const method = String(rule?.method || 'percentage').trim().toLowerCase() === 'fixed'
            ? 'fixed'
            : 'percentage';
        const isEnabled = rule?.is_enabled === undefined
            ? rule?.is_active === true
            : rule.is_enabled === true;
        return {
            ...rule,
            discount_rule_id: Number.isInteger(ruleId) && ruleId > 0 ? ruleId : null,
            discount_key: String(rule?.discount_key || '').trim().toLowerCase() || null,
            type,
            name: String(rule?.name || '').trim(),
            method,
            percentage: rule?.percentage == null ? null : Number(rule.percentage),
            fixed_amount: rule?.fixed_amount == null ? null : Number(rule.fixed_amount),
            is_enabled: isEnabled,
            is_approved: rule?.is_approved === true,
            requires_customer_id: rule?.requires_customer_id === true,
            requires_employee_id: rule?.requires_employee_id === true,
            requires_manager_approval: rule?.requires_manager_approval === true
        };
    })
    .filter((rule) => (
        rule.name
        && rule.type
        && rule.is_enabled === true
        && rule.is_approved === true
        && (rule.method === 'fixed'
            ? Number.isFinite(rule.fixed_amount) && rule.fixed_amount > 0
            : Number.isFinite(rule.percentage) && rule.percentage > 0 && rule.percentage <= 100)
    ));

export const getDiscountRuleSelectionKey = (discount) => {
    const type = String(discount?.type || '').trim().toLowerCase();
    const ruleId = Number.parseInt(discount?.rule_id ?? discount?.discount_rule_id, 10);
    if (type === 'custom' && Number.isInteger(ruleId) && ruleId > 0) return `custom:${ruleId}`;
    return type;
};

export const buildPosDiscountTypeOptions = (
    rules,
    fallbackOptions = [],
    { rulesReady = false } = {}
) => {
    const availableRules = normalizeAvailablePosDiscountRules(rules);
    if (!rulesReady) return toArray(fallbackOptions);

    const seenTypes = new Set();
    const configuredOptions = availableRules
        .filter((rule) => {
            if (rule.type === 'custom') return Boolean(rule.discount_rule_id);
            if (seenTypes.has(rule.type)) return false;
            seenTypes.add(rule.type);
            return true;
        })
        .map((rule) => ({
            value: rule.type === 'custom' ? `custom:${rule.discount_rule_id}` : rule.type,
            type: rule.type,
            label: rule.name,
            rule
        }));

    // Promo and Voucher remain specialized server-authoritative instruments.
    // They may be available without a configurable static rule, but synthetic
    // Employee/Senior/PWD/Manual choices must never be shown while the rule
    // directory is loading or unavailable.
    const specializedFallbacks = toArray(fallbackOptions).filter((option) => (
        ['promo', 'voucher'].includes(option?.value)
        && !configuredOptions.some((configuredOption) => configuredOption.value === option.value)
    ));
    return [...configuredOptions, ...specializedFallbacks];
};

export const findPosDiscountTypeOption = (options, selectionKey) => (
    toArray(options).find((option) => option.value === selectionKey) || null
);

export default buildPosDiscountTypeOptions;
