export function toValidDate(value) {
    if (!value) return null;
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function maxDate(a, b) {
    if (!a) return b || null;
    if (!b) return a || null;
    return a > b ? a : b;
}

export function buildWebhookDedupKey(body, headers) {
    return body?.id || headers?.['paypal-transmission-id'] || null;
}

export function extendOneCalendarMonth(baseDate, anchorDay) {
    const next = new Date(baseDate);
    const targetMonth = (next.getMonth() + 1) % 12;
    next.setMonth(next.getMonth() + 1);
    next.setDate(anchorDay);
    if (next.getMonth() !== targetMonth) {
        next.setDate(0);
    }
    return next;
}
