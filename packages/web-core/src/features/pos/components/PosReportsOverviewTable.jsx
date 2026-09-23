import { useMemo } from 'react';
import PosReportsResponsiveTable from './PosReportsResponsiveTable';

const resolveCurrencySymbol = (currencySymbol = '₱') => String(currencySymbol).toUpperCase() === 'PHP' ? '₱' : currencySymbol || '₱';
const money = (value, currencySymbol = '₱') => `${resolveCurrencySymbol(currencySymbol)}${Number(value || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const formatPeriod = (value) => { const raw = String(value || '').trim(); if (!raw) return '—'; if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) { const parsed = new Date(`${raw}T00:00:00`); if (!Number.isNaN(parsed.getTime())) return parsed.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }); } return raw; };

export default function PosReportsOverviewTable({ rows = [], currencySymbol = '₱', searchQuery = '' }) {
  const symbol = resolveCurrencySymbol(currencySymbol);
  const columns = useMemo(() => [
    { key: 'period', label: 'Business Date', widthClass: 'w-[180px]', required: true, visibility: { mobile: true, tabletPortrait: true, tabletLandscape: true, desktop: true }, getValue: (row) => row?.period || '', render: (row) => formatPeriod(row?.period) },
    { key: 'total_transactions', label: 'Transactions', align: 'center', widthClass: 'w-[120px]', required: true, visibility: { mobile: true, tabletPortrait: true, tabletLandscape: true, desktop: true }, getValue: (row) => Number(row?.total_transactions || 0), render: (row) => Number(row?.total_transactions || 0).toLocaleString('en-US') },
    { key: 'gross_sales', label: `Gross Sales (${symbol})`, align: 'left', widthClass: 'w-[150px]', required: true, visibility: { mobile: true, tabletPortrait: true, tabletLandscape: true, desktop: true }, getValue: (row) => Number(row?.gross_sales || 0), render: (row) => money(row?.gross_sales, currencySymbol) },
    { key: 'net_sales', label: `Net Sales (${symbol})`, align: 'left', widthClass: 'w-[150px]', required: true, visibility: { mobile: true, tabletPortrait: true, tabletLandscape: true, desktop: true }, getValue: (row) => Number(row?.net_sales || 0), render: (row) => money(row?.net_sales, currencySymbol) },
    { key: 'discounts', label: `Discounts (${symbol})`, align: 'left', widthClass: 'w-[140px]', visibility: { mobile: true, tabletPortrait: true, tabletLandscape: true, desktop: true }, getValue: (row) => Number(row?.discounts || 0), render: (row) => money(row?.discounts, currencySymbol) },
    { key: 'refunds_voids', label: `Refunds/Voids (${symbol})`, align: 'left', widthClass: 'w-[160px]', required: true, visibility: { mobile: true, tabletPortrait: true, tabletLandscape: true, desktop: true }, getValue: (row) => Number(row?.refunds_voids || 0), render: (row) => money(row?.refunds_voids, currencySymbol) }
  ], [currencySymbol, symbol]);
  return <PosReportsResponsiveTable rows={rows} columns={columns} searchQuery={searchQuery} getSearchValue={(row) => [formatPeriod(row?.period), row?.total_transactions, row?.gross_sales, row?.net_sales, row?.discounts, row?.refunds_voids].join(' ')} initialSort={{ key: 'period', direction: 'desc' }} title="Business date overview" ariaLabel="Business date report table" caption="Summary of transactions and sales by business date." emptyMessage="No daily sales were recorded for the selected filters." searchEmptyMessage="No business dates match your search." idPrefix="pos-reports-overview" resultLabel="business dates" />;
}
