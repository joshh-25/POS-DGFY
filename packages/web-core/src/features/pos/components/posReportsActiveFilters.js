import { formatPosDateRangeLabel } from './posFilterLabelUtils.js';

const GRANULARITY_LABELS = {
  daily: 'Daily',
  weekly: 'Weekly',
  monthly: 'Monthly',
  yearly: 'Yearly'
};

export function buildPosReportsActiveFilters({
  dateFilterApplied = false,
  dateRange = {},
  granularity,
  defaultGranularity,
  cashierLabel,
  paymentLabel,
  sourceLabel,
  deliveryProviderLabel,
  categoryLabel,
  searchQuery = ''
} = {}) {
  const filters = [];

  if (dateFilterApplied) {
    filters.push({ key: 'date', label: `Date: ${formatPosDateRangeLabel(dateRange.dateFrom, dateRange.dateTo)}` });
  }

  if (cashierLabel) filters.push({ key: 'cashier', label: `Cashier: ${cashierLabel}` });
  if (paymentLabel) filters.push({ key: 'payment', label: `Payment: ${paymentLabel}` });
  if (sourceLabel) filters.push({ key: 'source', label: `Source: ${sourceLabel}` });
  if (deliveryProviderLabel) filters.push({ key: 'delivery_provider', label: `Delivery Provider: ${deliveryProviderLabel}` });
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
