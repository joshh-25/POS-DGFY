export function toValidDate(value) {
    if (!value) return null;
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
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
