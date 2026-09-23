const GRANULARITY_LABELS = {
  daily: 'Daily',
  weekly: 'Weekly',
  monthly: 'Monthly',
  yearly: 'Yearly'
};

const formatDate = (value) => {
  const raw = String(value || '').trim();
  const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return raw;

  const [, year, month, day] = match;
  const date = new Date(Number(year), Number(month) - 1, Number(day));
  return Number.isNaN(date.getTime())
    ? raw
    : date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
};

export function buildPosReportsActiveFilters({
  dateFilterApplied = false,
  dateRange = {},
  granularity,
  defaultGranularity,
  cashierLabel,
  paymentLabel,
  sourceLabel,
  categoryLabel,
  searchQuery = ''
} = {}) {
  const filters = [];

  if (dateFilterApplied) {
    const dateFrom = formatDate(dateRange.dateFrom);
    const dateTo = formatDate(dateRange.dateTo);
    const dateLabel = dateFrom && dateTo
      ? (dateFrom === dateTo ? dateFrom : `${dateFrom} – ${dateTo}`)
      : dateFrom || dateTo || 'Custom range';
    filters.push({ key: 'date', label: `Date: ${dateLabel}` });
  }

  if (cashierLabel) filters.push({ key: 'cashier', label: `Cashier: ${cashierLabel}` });
  if (paymentLabel) filters.push({ key: 'payment', label: `Payment: ${paymentLabel}` });
  if (sourceLabel) filters.push({ key: 'source', label: `Source: ${sourceLabel}` });
  if (categoryLabel) filters.push({ key: 'category', label: `Category: ${categoryLabel}` });

  if (granularity && defaultGranularity && granularity !== defaultGranularity) {
    filters.push({
      key: 'granularity',
      label: `Period: ${GRANULARITY_LABELS[granularity] || granularity}`
    });
  }

  const query = String(searchQuery || '').trim();
  if (query) filters.push({ key: 'search', label: `Search: ${query}` });

  return filters;
}
