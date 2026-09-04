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
const normalizeSelectedDiscountItems = (draft) => {
    const entries = (Array.isArray(draft?.eligible_items) ? draft.eligible_items : [])
        .map((entry) => {
            const itemId = positiveInt(entry?.item_id);
            const eligibleQuantity = Number(entry?.eligible_quantity);
            if (!itemId || !Number.isFinite(eligibleQuantity) || eligibleQuantity <= 0) return null;
            const lineRef = text(entry?.line_ref);
            return {
                ...(lineRef ? { line_ref: lineRef } : {}),
                item_id: itemId,
                eligible_quantity: eligibleQuantity
            };
        })
        .filter(Boolean);
    if (entries.length > 0) {
        return [...new Map(entries.map((entry) => [entry.line_ref || `item:${entry.item_id}`, entry])).values()];
    }
    return [...new Set((Array.isArray(draft?.eligible_item_ids) ? draft.eligible_item_ids : [])
        .map(positiveInt)
        .filter(Boolean))]
        .map((itemId) => ({ item_id: itemId }));
};
const resolveSelectedDiscountLines = (lines, selectedItems, {
    invalidQuantityMessage = 'Selected discount quantity exceeds the cart quantity.',
    invalidQuantityReason = 'DISCOUNT_QUANTITY_INVALID'
} = {}) => {
    if (selectedItems.length === 0) return lines;
    const indexedLines = lines.map((line, index) => ({ line, index }));
    const resolved = new Map();

    selectedItems.forEach((selected) => {
        const selectedLineRef = text(selected.line_ref);
        const matches = indexedLines.filter(({ line }) => (
            positiveInt(line.item_id) === selected.item_id
            && (!selectedLineRef || text(line.line_ref) === selectedLineRef)
        ));
        if (matches.length === 0) {
            validationError('The selected discount items are no longer in the cart.', 'DISCOUNT_ITEM_SELECTION_INVALID', {
                item_id: selected.item_id,
                line_ref: selectedLineRef || null
            });
        }
        if (!selectedLineRef && selected.eligible_quantity != null && matches.length > 1) {
            validationError(
                'A selected item appears on multiple cart lines. Refresh the discount and select the exact line again.',
                'DISCOUNT_LINE_SELECTION_AMBIGUOUS',
                { item_id: selected.item_id }
            );
        }
        matches.forEach(({ line, index }) => {
            const quantity = Number(line.quantity || 0);
            if (selected.eligible_quantity != null && selected.eligible_quantity > quantity) {
                validationError(invalidQuantityMessage, invalidQuantityReason, {
                    item_ids: [selected.item_id],
                    line_refs: selectedLineRef ? [selectedLineRef] : []
                });
            }
            const selectedQuantity = selected.eligible_quantity == null ? quantity : selected.eligible_quantity;
            const lineSubtotal = Number(line.line_subtotal ?? (quantity * Number(line.sale_price || 0)));
            const unitSubtotal = quantity > 0 ? lineSubtotal / quantity : 0;
            resolved.set(index, {
                ...line,
                quantity: selectedQuantity,
                line_subtotal: round4(selectedQuantity * unitSubtotal)
            });
        });
    });

    return [...resolved.entries()]
        .sort(([left], [right]) => left - right)
        .map(([, line]) => line);
};

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
        const requestedItems = normalizeSelectedDiscountItems(draft);
        const requestedItemIds = requestedItems.map((entry) => entry.item_id);
        const scopedPreparedLines = requestedItemIds.length > 0
            ? resolveSelectedDiscountLines(preparedLines, requestedItems)
            : preparedLines;
        if (requestedItemIds.length > 0 && scopedPreparedLines.length === 0) {
            validationError('The selected discount items are no longer in the cart.', 'DISCOUNT_ITEM_SELECTION_INVALID');
        }
        const scopedSubtotalAmount = requestedItemIds.length > 0
            ? round4(scopedPreparedLines.reduce((sum, line) => sum + round4(line.line_subtotal ?? (Number(line.quantity) * Number(line.sale_price))), 0))
            : subtotalAmount;
        const promo = resolveCommercialPromoApplication({
            settings,
            promoCode: draft.promo_code,
            prepared: { preparedLines: scopedPreparedLines, subtotalAmount: scopedSubtotalAmount },
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
                lines: requestedItems.length > 0
                    ? requestedItems.filter((entry) => promo.eligibleItemIds.includes(entry.item_id))
                    : promo.eligibleItemIds.map((itemId) => ({ item_id: itemId }))
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
        // Preserve the existing empty-selection contract for older clients, while allowing the
        // unified POS selector to narrow the lines the voucher may discount. The voucher's own
        // scopes/pricelist still decide eligibility within this selected set.
        const requestedItems = normalizeSelectedDiscountItems(draft);
        const requestedItemIds = requestedItems.map((entry) => entry.item_id);
        const scopedVoucherPreparedLines = requestedItemIds.length > 0
            ? resolveSelectedDiscountLines(preparedLines, requestedItems)
            : preparedLines;
        if (requestedItemIds.length > 0 && scopedVoucherPreparedLines.length === 0) {
            validationError('The selected discount items are no longer in the cart.', 'DISCOUNT_ITEM_SELECTION_INVALID');
        }
        const voucherLines = scopedVoucherPreparedLines.map((line) => ({
            line_ref: text(line.line_ref) || null,
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
                    .map((allocation) => ({
                        ...(text(allocation.line_ref) ? { line_ref: text(allocation.line_ref) } : {}),
                        item_id: allocation.item_id
                    }))
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
        const rawBeneficiaries = Array.isArray(draft.beneficiaries) && draft.beneficiaries.length > 0
            ? draft.beneficiaries
            : [{
                category: type,
                name: draft.customer_name,
                id_number: draft.id_number,
                eligible_items: draft.eligible_items,
                eligible_item_ids: draft.eligible_item_ids
            }];
        const beneficiaries = rawBeneficiaries.map((beneficiary) => ({
            category: text(beneficiary?.category || type).toLowerCase(),
            name: text(beneficiary?.name),
            id_number: text(beneficiary?.id_number),
            lines: normalizeSelectedDiscountItems(beneficiary)
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
        const selectedLines = beneficiaries.flatMap((beneficiary) => resolveSelectedDiscountLines(preparedLines, beneficiary.lines, {
            invalidQuantityMessage: 'Selected Senior/PWD quantity exceeds the cart quantity.',
            invalidQuantityReason: 'STATUTORY_QUANTITY_INVALID'
        }));
        const invalidLines = selectedLines.filter((line) => !isSeniorPwdDiscountEligible(line.senior_pwd_discount_eligible));
        if (invalidLines.length > 0) {
            validationError('One or more selected items are not eligible for Senior/PWD discount.', 'STATUTORY_ITEM_NOT_ELIGIBLE', {
                item_ids: [...new Set(invalidLines.map((line) => positiveInt(line.item_id)))],
                line_refs: invalidLines.map((line) => text(line.line_ref)).filter(Boolean)
            });
        }
        const quantityByLine = selectedItems.reduce((totals, entry) => {
            const key = entry.line_ref || `item:${entry.item_id}`;
            return totals.set(key, (totals.get(key) || 0) + Number(entry.eligible_quantity || 0));
        }, new Map());
        for (const [key, quantity] of quantityByLine.entries()) {
            const matchingLine = preparedLines.find((line) => key.startsWith('item:')
                ? positiveInt(line.item_id) === positiveInt(key.slice(5))
                : text(line.line_ref) === key);
            if (!matchingLine || quantity > Number(matchingLine.quantity || 0)) {
                validationError('Combined Senior/PWD quantity exceeds the cart quantity.', 'STATUTORY_QUANTITY_INVALID', {
                    item_ids: matchingLine ? [positiveInt(matchingLine.item_id)] : [],
                    line_refs: key.startsWith('item:') ? [] : [key]
                });
            }
        }
        application.method = 'percentage';
        application.rate = Number(rule.rate ?? 20);
        application.amount = null;
        application.lines = selectedItems.map((entry) => ({ ...entry }));
        application.beneficiaries = beneficiaries;
        application.customer_name = beneficiaries.length === 1 ? beneficiaries[0].name : null;
        application.id_number = beneficiaries.length === 1 ? beneficiaries[0].id_number : null;
    }

    if (['employee', 'manual'].includes(type)) {
        const selectedItems = normalizeSelectedDiscountItems(draft);
        const selectedItemIds = selectedItems.map((entry) => entry.item_id);
        if (selectedItemIds.length > 0) {
            resolveSelectedDiscountLines(preparedLines, selectedItems);
            application.lines = selectedItems.map((entry) => ({ ...entry }));
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
