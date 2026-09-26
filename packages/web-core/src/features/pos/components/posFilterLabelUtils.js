const parsePosFilterDate = (value) => {
    const raw = String(value || '').trim();
    const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!match) return raw;

    const [, year, month, day] = match;
    const date = new Date(Number(year), Number(month) - 1, Number(day));
    return Number.isNaN(date.getTime())
        ? raw
        : date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
};

export const formatPosDateRangeLabel = (dateFrom, dateTo) => {
    const from = parsePosFilterDate(dateFrom);
    const to = parsePosFilterDate(dateTo);
    if (from && to) return from === to ? from : `${from} – ${to}`;
    return from || to || 'Custom range';
};
