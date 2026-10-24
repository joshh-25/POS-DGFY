import { useMemo } from 'react';
import PosReportsResponsiveTable from './PosReportsResponsiveTable.jsx';
import { getPosReportSignedValueTone } from './posReportValueTones.js';

const resolveCurrencySymbol = (currencySymbol = '₱') => String(currencySymbol).toUpperCase() === 'PHP' ? '₱' : currencySymbol || '₱';
const money = (value, currencySymbol = '₱') => `${resolveCurrencySymbol(currencySymbol)}${Number(value || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const amount = (value) => value == null || value === '' || !Number.isFinite(Number(value)) ? null : Number(value);
const getShiftId = (row) => amount(row?.shift_id);
const getShiftLabel = (row) => getShiftId(row) == null ? '—' : `RS-${getShiftId(row)}`;
const getOpeningCashier = (row) => row?.opening_cashier_name || 'Unassigned';
const getOpeningFloat = (row) => amount(row?.opening_float_amount) ?? 0;
const getCashSales = (row) => amount(row?.cash_sales_amount) ?? 0;
const getExpected = (row) => amount(row?.expected_cash_amount) ?? 0;
const getCounted = (row) => amount(row?.closing_cash_amount);
const getVariance = (row) => amount(row?.variance_amount);
const getVariancePercentage = (row) => { const variance = getVariance(row); const expected = getExpected(row); return variance == null || expected === 0 ? null : (variance / expected) * 100; };
const getStatus = (row) => { const variance = getVariance(row); if (variance == null) return 'Open'; if (variance > 0) return 'Over'; if (variance < 0) return 'Short'; return 'Reconciled'; };
const getStatusTone = (status) => status === 'Short' ? 'danger' : status === 'Reconciled' ? 'positive' : status === 'Open' ? 'muted' : 'secondary';
const getSearchValue = (row) => [getShiftLabel(row), getOpeningCashier(row), getOpeningFloat(row), getCashSales(row), getExpected(row), getCounted(row), getVariance(row), getVariancePercentage(row), getStatus(row)].join(' ').toLowerCase();

export default function PosReportsRegistersTable({ rows = [], currencySymbol = '₱', searchQuery = '' }) {
  const symbol = resolveCurrencySymbol(currencySymbol);
  const columns = useMemo(() => [
    { key: 'shift_id', label: 'Register Shift', align: 'center', widthClass: 'w-[150px]', required: true, visibility: { mobile: true, tabletPortrait: true, tabletLandscape: true, desktop: true }, getValue: getShiftId, render: getShiftLabel },
    { key: 'opening_cashier_name', label: 'Opening Cashier', align: 'left', widthClass: 'w-[170px]', required: true, visibility: { mobile: false, tabletPortrait: true, tabletLandscape: true, desktop: true }, getValue: getOpeningCashier },
    { key: 'opening_float_amount', label: `Opening Float (${symbol})`, valueTone: (row) => getPosReportSignedValueTone(getOpeningFloat(row)), align: 'left', widthClass: 'w-[140px]', visibility: { mobile: false, tabletPortrait: false, tabletLandscape: false, desktop: true }, defaultVisible: false, getValue: getOpeningFloat, render: (row) => money(getOpeningFloat(row), currencySymbol) },
    { key: 'cash_sales_amount', label: `Cash Sales (${symbol})`, valueTone: (row) => getPosReportSignedValueTone(getCashSales(row)), align: 'left', widthClass: 'w-[140px]', visibility: { mobile: false, tabletPortrait: false, tabletLandscape: false, desktop: true }, defaultVisible: false, getValue: getCashSales, render: (row) => money(getCashSales(row), currencySymbol) },
    { key: 'expected_cash_amount', label: `Expected (${symbol})`, valueTone: (row) => getPosReportSignedValueTone(getExpected(row)), align: 'left', widthClass: 'w-[130px]', defaultVisible: true, visibility: { mobile: false, tabletPortrait: false, tabletLandscape: true, desktop: true }, getValue: getExpected, render: (row) => money(getExpected(row), currencySymbol) },
    { key: 'closing_cash_amount', label: `Counted (${symbol})`, valueTone: (row) => getCounted(row) == null ? 'muted' : getPosReportSignedValueTone(getCounted(row)), align: 'left', widthClass: 'w-[130px]', defaultVisible: true, visibility: { mobile: false, tabletPortrait: false, tabletLandscape: true, desktop: true }, getValue: (row) => getCounted(row) ?? -Infinity, render: (row) => getCounted(row) == null ? 'Pending' : money(getCounted(row), currencySymbol) },
    { key: 'variance_amount', label: `Variance (${symbol})`, valueTone: (row) => { const value = getVariance(row); return value == null ? 'muted' : value < 0 ? 'danger' : 'secondary'; }, align: 'left', widthClass: 'w-[130px]', required: true, visibility: { mobile: true, tabletPortrait: true, tabletLandscape: true, desktop: true }, getValue: (row) => getVariance(row) ?? -Infinity, render: (row) => { const value = getVariance(row); return <span className="font-black">{value == null ? '—' : money(value, currencySymbol)}</span>; } },
    { key: 'variance_percentage', label: 'Variance %', align: 'left', widthClass: 'w-[110px]', visibility: { mobile: false, tabletPortrait: false, tabletLandscape: false, desktop: true }, defaultVisible: false, getValue: (row) => getVariancePercentage(row) ?? -Infinity, render: (row) => { const value = getVariancePercentage(row); return value == null ? '—' : `${value.toFixed(2)}%`; } },
    { key: 'status', label: 'Status', valueTone: (row) => getStatusTone(getStatus(row)), align: 'center', widthClass: 'w-[120px]', required: true, visibility: { mobile: true, tabletPortrait: true, tabletLandscape: true, desktop: true }, getValue: getStatus, render: (row) => <span className="font-black">{getStatus(row)}</span> }
  ], [currencySymbol, symbol]);

  return <PosReportsResponsiveTable rows={rows} columns={columns} searchQuery={searchQuery} getSearchValue={getSearchValue} initialSort={{ key: 'shift_id', direction: 'asc' }} ariaLabel="Register reconciliation table" title="Register reconciliation" idPrefix="pos-reports-registers" caption="Register reconciliation showing expected and counted amounts, variance, and status." emptyMessage="No register shifts were recorded for these filters." searchEmptyMessage="No register rows match your search." resultLabel="register rows" />;
}
