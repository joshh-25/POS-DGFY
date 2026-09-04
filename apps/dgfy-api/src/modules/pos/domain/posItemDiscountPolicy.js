import { DomainError, DomainErrorCode } from '../../shared/contracts/domainErrors.js';
import { resolvePosGovernedDiscount } from './posDiscountPolicy.js';

const text = (value) => String(value || '').trim();
const positiveInt = (value) => {
    const parsed = Number.parseInt(value, 10);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
};
const ITEM_DISCOUNT_TYPES = new Set(['senior', 'pwd', 'employee', 'promo', 'manual']);

const validationError = (message, reasonCode, details = {}) => {
    throw new DomainError(DomainErrorCode.VALIDATION_FAILED, message, {
        statusCode: 422,
        details: { reason_code: reasonCode, ...details }
    });
};

export const resolvePosItemDiscount = async ({
    draft,
    itemId,
    itemName,
    preparedLine,
    settings = {},
    orderMethod = '',
    findActiveRule,
    findActiveEmployee,
    findActiveEmployeeDirectory
}) => {
    if (!draft || typeof draft !== 'object') return null;
    const normalizedItemId = positiveInt(itemId);
    if (!normalizedItemId) validationError('Item discount requires a valid item.', 'ITEM_DISCOUNT_ITEM_REQUIRED');
    if (!preparedLine || Number(preparedLine.item_id) !== normalizedItemId) {
        validationError('Item discount could not be matched to the selected item.', 'ITEM_DISCOUNT_ITEM_MISMATCH', { item_id: normalizedItemId });
    }
    const type = text(draft.discount_type || draft.type).toLowerCase() || 'manual';
    if (!ITEM_DISCOUNT_TYPES.has(type)) {
        validationError('Unsupported item discount type.', 'ITEM_DISCOUNT_TYPE_INVALID', { discount_type: type });
    }

    const resolution = await resolvePosGovernedDiscount({
        draft: {
            ...draft,
            type,
            label: text(draft.label),
            eligible_items: ['senior', 'pwd'].includes(type)
                ? [{ item_id: normalizedItemId, eligible_quantity: Number(preparedLine.quantity || 0) }]
                : draft.eligible_items
        },
        preparedLines: [preparedLine],
        subtotalAmount: Number(preparedLine.line_subtotal || (Number(preparedLine.quantity || 0) * Number(preparedLine.sale_price || 0))),
        settings,
        orderMethod,
        requireCustomerName: type === 'promo',
        findActiveRule,
        findActiveEmployee,
        findActiveEmployeeDirectory
    });
    const application = resolution?.application;
    if (!application) validationError('The item discount could not be resolved.', 'ITEM_DISCOUNT_RESOLUTION_FAILED', { item_id: normalizedItemId });

    return {
        ...application,
        item_id: normalizedItemId,
        item_name: text(itemName),
        type: 'item',
        discount_type: type,
        label: type === 'manual' ? (text(draft.label) || 'Other Discount') : application.label,
        promo_application: resolution?.promo || null,
        reason: text(draft.reason).slice(0, 500) || null,
    };
};

export default resolvePosItemDiscount;
