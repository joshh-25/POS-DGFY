import { getCartLineSubtotal, round4 } from './posCheckoutTerminalUtils.js';

export const CUSTOMER_DISPLAY_VIEW_STATES = Object.freeze({
    WAITING: 'waiting',
    ACTIVE: 'active',
    PAYMENT: 'payment',
    COMPLETED: 'completed'
});

const MAX_ITEM_NAME_LENGTH = 120;
const MAX_OPTION_NAME_LENGTH = 80;

const sanitizeDisplayText = (value, maxLength) => String(value || '')
    .split('')
    .filter((character) => {
        const code = character.charCodeAt(0);
        return code > 31 && code !== 127;
    })
    .join('')
    .trim()
    .slice(0, maxLength);

const toFiniteNumber = (value, fallback = 0) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
};
const normalizeMoney = (value) => round4(Math.max(0, toFiniteNumber(value)));

const normalizeQuantity = (value) => round4(Math.max(0, toFiniteNumber(value)));

const projectLine = (line, index) => {
    const options = Array.isArray(line?.service_option_details)
        ? line.service_option_details
            .map((option) => sanitizeDisplayText(option?.name, MAX_OPTION_NAME_LENGTH))
            .filter(Boolean)
            .slice(0, 8)
        : [];

    return {
        key: `line-${index}`,
        name: sanitizeDisplayText(line?.item_name, MAX_ITEM_NAME_LENGTH) || 'Item',
        quantity: normalizeQuantity(line?.quantity),
        unitPrice: normalizeMoney(line?.sale_price),
        lineTotal: normalizeMoney(getCartLineSubtotal(line)),
        options
    };
};

/**
 * Projects the cashier's already-calculated POS state into the deliberately
 * small, read-only payload that may cross the customer-display boundary.
 * Internal item IDs, notes, tokens, user data, and API responses are not
 * included. The total is accepted from the POS financial workflow rather than
 * recalculated here so the two screens cannot drift on discounts or VAT.
 */
export const projectCustomerDisplaySnapshot = ({
    cart = [],
    cartSubtotal = 0,
    cartTotal = 0,
    cartTotalQuantity = 0,
    calculatedDiscountAmount = 0,
    serviceFeeAmount = 0,
    restaurantServiceChargeAmount = 0,
    checkoutConfirmModalOpen = false,
    checkoutLoading = false,
    currency = 'PHP',
    viewState = null
} = {}) => {
    const safeCart = Array.isArray(cart) ? cart : [];
    const items = safeCart.map(projectLine);
    const resolvedViewState = Object.values(CUSTOMER_DISPLAY_VIEW_STATES).includes(viewState)
        ? viewState
        : checkoutLoading || checkoutConfirmModalOpen
            ? CUSTOMER_DISPLAY_VIEW_STATES.PAYMENT
            : items.length > 0
                ? CUSTOMER_DISPLAY_VIEW_STATES.ACTIVE
                : CUSTOMER_DISPLAY_VIEW_STATES.WAITING;

    return {
        viewState: resolvedViewState,
        currency: sanitizeDisplayText(currency, 12) || 'PHP',
        items,
        itemCount: normalizeQuantity(cartTotalQuantity),
        subtotal: normalizeMoney(cartSubtotal),
        discount: normalizeMoney(calculatedDiscountAmount),
        serviceFees: normalizeMoney(toFiniteNumber(serviceFeeAmount) + toFiniteNumber(restaurantServiceChargeAmount)),
        total: normalizeMoney(cartTotal),
        issuedAt: Date.now()
    };
};
