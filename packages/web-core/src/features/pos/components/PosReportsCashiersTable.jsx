import { useMemo } from 'react';
import PosReportsResponsiveTable from './PosReportsResponsiveTable.jsx';

const money = (value, currencySymbol = '₱') => `${String(currencySymbol).toUpperCase() === 'PHP' ? '₱' : currencySymbol || '₱'}${Number(value || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const getSummary = (row) => row?.summary || {};
const getCashierName = (row) => row?.cashier_name || 'Unassigned';
const getTransactions = (row) => Number(getSummary(row).total_transactions || 0);
const getGrossSales = (row) => Number(getSummary(row).gross_sales || 0);
const getDiscounts = (row) => Number(getSummary(row).discounts || 0);
const getNetSales = (row) => Number(getSummary(row).net_sales || 0);
const getSearchValue = (row) => [getCashierName(row), getTransactions(row), getGrossSales(row), getDiscounts(row), getNetSales(row)].join(' ').toLowerCase();

export default function PosReportsCashiersTable({ rows = [], currencySymbol = '₱', searchQuery = '' }) {
  const columns = useMemo(() => [
    { key: 'rank', label: 'Rank', widthClass: 'w-[70px]', required: true, visibility: { mobile: false, tabletPortrait: true, tabletLandscape: true, desktop: true }, getValue: (row) => Number(row?.rank || 0), render: (row, index) => row?.rank || index + 1 },
    { key: 'cashier_name', label: 'Cashier', widthClass: 'w-[220px]', required: true, visibility: { mobile: true, tabletPortrait: true, tabletLandscape: true, desktop: true }, getValue: getCashierName },
    { key: 'transactions', label: 'Transactions', widthClass: 'w-[150px]', required: true, visibility: { mobile: true, tabletPortrait: true, tabletLandscape: true, desktop: true }, align: 'right', getValue: getTransactions, render: (row) => getTransactions(row).toLocaleString('en-US') },
    { key: 'gross_sales', label: `Gross Sales (${currencySymbol === 'PHP' ? '₱' : currencySymbol})`, widthClass: 'w-[180px]', visibility: { mobile: false, tabletPortrait: false, tabletLandscape: true, desktop: true }, align: 'right', getValue: getGrossSales, render: (row) => money(getGrossSales(row), currencySymbol) },
    { key: 'discounts', label: `Discounts (${currencySymbol === 'PHP' ? '₱' : currencySymbol})`, widthClass: 'w-[180px]', visibility: { mobile: false, tabletPortrait: false, tabletLandscape: false, desktop: true }, align: 'right', getValue: getDiscounts, defaultVisible: false, render: (row) => money(getDiscounts(row), currencySymbol) },
    { key: 'net_sales', label: `Net Sales (${currencySymbol === 'PHP' ? '₱' : currencySymbol})`, widthClass: 'w-[180px]', required: true, visibility: { mobile: true, tabletPortrait: true, tabletLandscape: true, desktop: true }, align: 'right', getValue: getNetSales, render: (row) => <span className="font-semibold text-[#334155]">{money(getNetSales(row), currencySymbol)}</span> }
  ], [currencySymbol]);

  return <PosReportsResponsiveTable rows={rows} columns={columns} searchQuery={searchQuery} getSearchValue={getSearchValue} initialSort={{ key: 'net_sales', direction: 'desc' }} ariaLabel="Cashier sales table" title="Cashier sales" idPrefix="pos-reports-cashiers" caption="Cashier sales ranked by net sales with transaction, gross sales, discount, and net sales totals." emptyMessage="No cashier sales were recorded for these filters." searchEmptyMessage="No cashier rows match your search." resultLabel="cashiers" />;
}
