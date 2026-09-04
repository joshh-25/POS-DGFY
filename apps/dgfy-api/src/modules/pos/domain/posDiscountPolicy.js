import { DomainError, DomainErrorCode } from '../../shared/contracts/domainErrors.js';
import { resolveCommercialPromoApplication } from '../../shared/utils/commercialPromoPolicy.js';

const STATUTORY_TYPES = new Set(['senior', 'pwd']);
const RULE_TYPES = new Set(['senior', 'pwd', 'employee', 'manual']);
const text = (value) => String(value || '').trim();
const positiveInt = (value) => {
    const parsed = Number.parseInt(value, 10);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
};
const isSeniorPwdDiscountEligible = (value) => value === true || value === 1 || value === '1';

const validationError = (message, reasonCode, details = {}) => {
    throw new DomainError(DomainErrorCode.VALIDATION_FAILED, message, {
        statusCode: 422,
        details: { reason_code: reasonCode, ...details }
    });
};

const resolveRuleApplication = ({ draft, rule }) => {
    const configuredRate = rule.rate == null ? null : Number(rule.rate);
    const configuredAmount = rule.fixed_amount == null ? null : Number(rule.fixed_amount);
    const method = configuredRate != null
        ? 'percentage'
        : (configuredAmount != null ? 'fixed' : (text(draft.method || rule.method).toLowerCase() || 'percentage'));
    return {
        ...draft,
        label: text(rule.name) || draft.label,
        rule_id: positiveInt(rule.id),
        method,
        rate: method === 'percentage' ? (configuredRate ?? Number(draft.rate || 0)) : null,
        amount: method === 'fixed' ? (configuredAmount ?? Number(draft.amount || 0)) : null,
        max_discount_amount: rule.max_discount_amount == null ? null : Number(rule.max_discount_amount)
    };
};

export const resolvePosGovernedDiscount = async ({
    draft,
    preparedLines = [],
    subtotalAmount = 0,
    settings = {},
    orderMethod = '',
    findActiveRule,
    findActiveEmployee
}) => {
    if (!draft || typeof draft !== 'object') return null;
    const type = text(draft.type).toLowerCase();
    if (type && !STATUTORY_TYPES.has(type) && !text(draft.customer_name)) {
        validationError('Customer name is required for this discount.', 'DISCOUNT_CUSTOMER_NAME_REQUIRED');
    }

    if (type === 'promo') {
        const promo = resolveCommercialPromoApplication({
            settings,
            promoCode: draft.promo_code,
            prepared: { preparedLines, subtotalAmount },
            channel: 'pos',
            orderMethod
        });
        return {
            application: {
                ...draft,
                type: 'promo',
                label: promo.discountLabel,
                method: 'percentage',
                rate: promo.discountRate,
                amount: null,
                promo_code: promo.enteredPromoCode,
                lines: promo.eligibleItemIds.map((itemId) => ({ item_id: itemId }))
            },
            promo
        };
    }

    if (!RULE_TYPES.has(type)) {
        validationError('Unsupported governed discount type.', 'UNSUPPORTED_DISCOUNT_TYPE', { discount_type: type });
    }
    if (typeof findActiveRule !== 'function') {
        throw new Error('findActiveRule dependency is required for governed discounts');
    }
    const rule = await findActiveRule(type);
    if (!rule) validationError('The selected discount rule is inactive or unavailable.', 'DISCOUNT_RULE_INACTIVE', { discount_type: type });

    const application = resolveRuleApplication({ draft: { ...draft, type }, rule });
    if (STATUTORY_TYPES.has(type)) {
        const linesByItemId = new Map(preparedLines.map((line) => [positiveInt(line.item_id), line]));
        const rawBeneficiaries = Array.isArray(draft.beneficiaries) && draft.beneficiaries.length > 0
            ? draft.beneficiaries
            : [{
                category: type,
                name: draft.customer_name,
                id_number: draft.id_number,
                eligible_items: Array.isArray(draft.eligible_items) && draft.eligible_items.length > 0
                    ? draft.eligible_items
                    : [...new Set((Array.isArray(draft.eligible_item_ids) ? draft.eligible_item_ids : []).map(positiveInt).filter(Boolean))]
                        .map((itemId) => ({ item_id: itemId, eligible_quantity: Number(linesByItemId?.get?.(itemId)?.quantity || 1) }))
            }];
        const beneficiaries = rawBeneficiaries.map((beneficiary) => ({
            category: text(beneficiary?.category || type).toLowerCase(),
            name: text(beneficiary?.name),
            id_number: text(beneficiary?.id_number),
            lines: (Array.isArray(beneficiary?.eligible_items) ? beneficiary.eligible_items : []).map((entry) => ({
                item_id: positiveInt(entry?.item_id),
                eligible_quantity: Number(entry?.eligible_quantity)
            })).filter((entry) => entry.item_id && Number.isFinite(entry.eligible_quantity) && entry.eligible_quantity > 0)
        }));
        if (beneficiaries.some((beneficiary) => !STATUTORY_TYPES.has(beneficiary.category) || !beneficiary.name || !beneficiary.id_number)) {
            validationError('Each Senior/PWD beneficiary requires a category, customer name, and ID number.', 'STATUTORY_IDENTITY_REQUIRED');
        }
        const normalizedIds = beneficiaries.map((beneficiary) => beneficiary.id_number.toLowerCase());
        if (new Set(normalizedIds).size !== normalizedIds.length) {
            validationError('Each Senior/PWD beneficiary ID number must be unique within the order.', 'STATUTORY_BENEFICIARY_DUPLICATE');
        }
        if (beneficiaries.some((beneficiary) => beneficiary.lines.length === 0)) {
            validationError('Select at least one eligible item for each beneficiary.', 'STATUTORY_ITEM_SELECTION_REQUIRED');
        }
        const selectedItems = beneficiaries.flatMap((beneficiary) => beneficiary.lines);
        const selectedIds = [...new Set(selectedItems.map((entry) => entry.item_id))];
        if (selectedIds.length === 0) validationError('Select at least one eligible item.', 'STATUTORY_ITEM_SELECTION_REQUIRED');
        const invalidIds = selectedIds.filter((itemId) => !isSeniorPwdDiscountEligible(linesByItemId.get(itemId)?.senior_pwd_discount_eligible));
        if (invalidIds.length > 0) {
            validationError('One or more selected items are not eligible for Senior/PWD discount.', 'STATUTORY_ITEM_NOT_ELIGIBLE', { item_ids: invalidIds });
        }
        const quantityByItemId = selectedItems.reduce((totals, entry) => totals.set(entry.item_id, (totals.get(entry.item_id) || 0) + entry.eligible_quantity), new Map());
        const invalidQuantities = [...quantityByItemId.entries()].filter(([itemId, quantity]) => quantity > Number(linesByItemId.get(itemId)?.quantity || 0));
        if (invalidQuantities.length > 0) {
            validationError('Combined Senior/PWD quantity exceeds the cart quantity.', 'STATUTORY_QUANTITY_INVALID', { item_ids: invalidQuantities.map(([itemId]) => itemId) });
        }
        application.method = 'percentage';
        application.rate = Number(rule.rate ?? 20);
        application.amount = null;
        application.lines = selectedItems.map((entry) => ({ item_id: entry.item_id, ...(entry.eligible_quantity != null ? { eligible_quantity: entry.eligible_quantity } : {}) }));
        application.beneficiaries = beneficiaries;
        application.customer_name = beneficiaries.length === 1 ? beneficiaries[0].name : null;
        application.id_number = beneficiaries.length === 1 ? beneficiaries[0].id_number : null;
    }

    if (type === 'employee') {
        const employeeId = positiveInt(draft.employee_id);
        if (employeeId) {
            if (typeof findActiveEmployee !== 'function') {
                validationError('A valid active employee ID is required.', 'EMPLOYEE_ID_REQUIRED');
            }
            const employee = await findActiveEmployee(employeeId);
            if (!employee) validationError('Employee ID does not match an active employee.', 'EMPLOYEE_NOT_FOUND');
            application.employee_id = String(employee.user_id);
            application.employee_name = text(employee.username);
        } else {
            application.employee_id = null;
            application.employee_name = null;
        }
    }

    if (type === 'manual' && text(draft.reason).length < 3) {
        validationError('A reason is required for a manual discount.', 'MANUAL_DISCOUNT_REASON_REQUIRED');
    }

    if (['employee', 'manual'].includes(type)) {
        if (application.method === 'percentage' && (!(application.rate > 0) || application.rate > 100)) {
            validationError('Discount rate must be from 0.01 to 100.', 'DISCOUNT_RATE_INVALID');
        }
        if (application.method === 'fixed' && !(application.amount > 0)) {
            validationError('Fixed discount amount must be greater than zero.', 'DISCOUNT_AMOUNT_INVALID');
        }
    }

    return { application, promo: null };
};

export default resolvePosGovernedDiscount;
