const PIN_HASH_FIELDS = Object.freeze([
    'pos_cashier_pin_hash',
    'pos_approval_pin_hash',
    'pos_day_close_pin_hash'
]);

/**
 * Returns the canonical POS PIN hash first, then a legacy hash during the
 * one-time compatibility window. Raw PINs never cross this helper boundary.
 */
export const resolvePosGlobalPinHash = (operator, legacyFields = []) => {
    const fields = [
        PIN_HASH_FIELDS[0],
        ...(Array.isArray(legacyFields) ? legacyFields : [])
    ];
    for (const field of fields) {
        const hash = String(operator?.[field] || '').trim();
        if (hash) return hash;
    }
    return '';
};

export const hasConfiguredPosGlobalPin = (operator) => Boolean(
    String(operator?.[PIN_HASH_FIELDS[0]] || '').trim()
);

export const hasConfiguredPosPinForAction = (operator, legacyFields = []) => Boolean(
    resolvePosGlobalPinHash(operator, legacyFields)
);

export const POS_GLOBAL_PIN_HASH_FIELDS = PIN_HASH_FIELDS;

export default resolvePosGlobalPinHash;
