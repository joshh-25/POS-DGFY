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

// Local one-liner, matching the existing convention: storeUseCases.js:129 defines the same helper
// the same way for the same reason -- a single one-liner doesn't earn a shared module.
const round4 = (value) => Math.round((Number(value) || 0) * 10000) / 10000;

export const resolvePosGovernedDiscount = async ({
    draft,
    preparedLines = [],
    subtotalAmount = 0,
    settings = {},
    orderMethod = '',
    requireCustomerName = true,
    findActiveRule,
    findActiveEmployeeDirectory,
    // #712: bound by the caller (posUseCases.js) with the open checkout transaction, idempotency
    // key, and channel already captured -- this domain module stays DB-agnostic, same pattern as
    // findActiveRule/findActiveEmployeeDirectory above. Signature: async ({ code, lines }) => redemption
    // result (redeemVoucherUseCase's or previewVoucherEligibilityUseCase's return shape).
    redeemVoucher
}) => {
    if (!draft || typeof draft !== 'object') return null;
    const type = text(draft.type).toLowerCase();
    if (requireCustomerName && type && type !== 'employee' && !STATUTORY_TYPES.has(type) && !text(draft.customer_name)) {
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

    if (type === 'voucher') {
        if (typeof redeemVoucher !== 'function') {
            throw new Error('redeemVoucher dependency is required for voucher governed discounts');
        }
        const voucherCode = text(draft.voucher_code);
        if (!voucherCode) {
            validationError('Voucher code is required.', 'VOUCHER_CODE_REQUIRED');
        }
        // Sale-level only (settled 2026-08-20, #712) -- a voucher's own `voucher_scopes`/pricelist
        // decides which lines it touches, exactly as on the storefront. Pass every prepared line;
        // the redemption use case resolves eligibility itself.
        const voucherLines = preparedLines.map((line) => ({
            item_id: line.item_id,
            quantity: line.quantity,
            sale_price: line.sale_price,
            line_subtotal: line.line_subtotal ?? line.global_discount_base_amount,
            cost_snapshot: line.cost_snapshot
        }));
        const voucher = await redeemVoucher({ code: voucherCode, lines: voucherLines });
        if (!voucher?.applied) {
            return { application: null, promo: null, voucher: null };
        }
        return {
            application: {
                ...draft,
                type: 'voucher',
                label: voucher.badge || voucher.title || `Voucher (${voucher.code})`,
                method: voucher.benefitClass === 'percent_off' ? 'percentage' : 'fixed',
                // percentOffBps is basis points (10000 = 100%), matching storeUseCases.js's
                // identical `round4(redemption.percentOffBps / 100)` conversion.
                rate: voucher.benefitClass === 'percent_off'
                    ? round4(Number(voucher.percentOffBps || 0) / 100)
                    : null,
                amount: null,
                // Reuses the fiscal `promo_code` column -- matches the storefront's
                // `buildVoucherDiscountRecord` (storeUseCases.js:1413-1432) and is why
                // ReceiptPrintView.jsx already prints "Voucher Code" off this same field.
                promo_code: voucher.code,
                lines: (voucher.lineAllocations || [])
                    .filter((allocation) => allocation.eligible !== false)
                    .map((allocation) => ({ item_id: allocation.item_id }))
            },
            promo: null,
            voucher
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
        if (!text(draft.customer_name) || !text(draft.id_number)) {
            validationError('Customer name and Senior/PWD ID number are required.', 'STATUTORY_IDENTITY_REQUIRED');
        }
        const selectedItems = Array.isArray(draft.eligible_items) && draft.eligible_items.length > 0
            ? draft.eligible_items.map((entry) => ({
                item_id: positiveInt(entry?.item_id),
                eligible_quantity: Number(entry?.eligible_quantity)
            })).filter((entry) => entry.item_id && Number.isFinite(entry.eligible_quantity) && entry.eligible_quantity > 0)
            : [...new Set((Array.isArray(draft.eligible_item_ids) ? draft.eligible_item_ids : []).map(positiveInt).filter(Boolean))]
                .map((itemId) => ({ item_id: itemId, eligible_quantity: null }));
        const selectedIds = [...new Set(selectedItems.map((entry) => entry.item_id))];
        if (selectedIds.length === 0) validationError('Select at least one eligible item.', 'STATUTORY_ITEM_SELECTION_REQUIRED');
        const linesByItemId = new Map(preparedLines.map((line) => [positiveInt(line.item_id), line]));
        const invalidIds = selectedIds.filter((itemId) => !isSeniorPwdDiscountEligible(linesByItemId.get(itemId)?.senior_pwd_discount_eligible));
        if (invalidIds.length > 0) {
            validationError('One or more selected items are not eligible for Senior/PWD discount.', 'STATUTORY_ITEM_NOT_ELIGIBLE', { item_ids: invalidIds });
        }
        const invalidQuantities = selectedItems.filter((entry) => {
            const line = linesByItemId.get(entry.item_id);
            return entry.eligible_quantity != null && entry.eligible_quantity > Number(line?.quantity || 0);
        });
        if (invalidQuantities.length > 0) {
            validationError('Selected Senior/PWD quantity exceeds the cart quantity.', 'STATUTORY_QUANTITY_INVALID', { item_ids: invalidQuantities.map((entry) => entry.item_id) });
        }
        application.method = 'percentage';
        application.rate = Number(rule.rate ?? 20);
        application.amount = null;
        application.lines = selectedItems.map((entry) => ({ item_id: entry.item_id, ...(entry.eligible_quantity != null ? { eligible_quantity: entry.eligible_quantity } : {}) }));
    }

    if (['employee', 'manual'].includes(type)) {
        const selectedItemIds = [...new Set((Array.isArray(draft.eligible_item_ids) ? draft.eligible_item_ids : [])
            .map(positiveInt)
            .filter(Boolean))];
        if (selectedItemIds.length > 0) {
            const linesByItemId = new Map(preparedLines.map((line) => [positiveInt(line.item_id), line]));
            const selectedLines = selectedItemIds.filter((itemId) => linesByItemId.has(itemId));
            if (selectedLines.length === 0) {
                validationError('The selected discount items are no longer in the cart.', 'DISCOUNT_ITEM_SELECTION_INVALID');
            }
            application.lines = selectedLines.map((itemId) => ({ item_id: itemId }));
        }
    }

    if (type === 'employee') {
        const employeeDirectoryId = positiveInt(draft.employee_directory_id);
        if (!employeeDirectoryId) {
            validationError('Select an active registered employee for this discount.', 'EMPLOYEE_DIRECTORY_ID_REQUIRED');
        }
        if (typeof findActiveEmployeeDirectory !== 'function') {
            throw new Error('findActiveEmployeeDirectory dependency is required for employee discounts');
        }
        const employee = await findActiveEmployeeDirectory(employeeDirectoryId);
        if (!employee) validationError('Employee does not match an active registered employee.', 'EMPLOYEE_DIRECTORY_NOT_FOUND');
        application.employee_directory_id = Number(employee.employee_id);
        application.employee_id = text(employee.employee_code);
        application.employee_name = text(employee.full_name);
        application.employee_email = text(employee.email).toLowerCase() || null;
        application.employee_user_id = null;
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
