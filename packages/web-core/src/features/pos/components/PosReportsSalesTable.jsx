import { useMemo } from 'react';
import PosReportsResponsiveTable from './PosReportsResponsiveTable.jsx';
import { formatPosTransactionPaymentMethods } from '../utils/posPaymentMethods.js';

const ORDER_METHOD_LABELS = Object.freeze({
  dine_in: 'Walk-in', takeout: 'Takeout', pickup: 'Pickup', delivery: 'Delivery', online: 'Online'
});
const PAYMENT_METHOD_TONES = Object.freeze({
  cash: 'text-emerald-700',
  gcash: 'text-sky-700',
  maya: 'text-teal-700',
  card: 'text-violet-700',
  'bank transfer': 'text-amber-700',
  'employee credit': 'text-rose-700'
});
const ORDER_METHOD_TONES = Object.freeze({
  'walk in': 'text-[#1A4E8D]',
  takeout: 'text-sky-700',
  pickup: 'text-violet-700',
  delivery: 'text-amber-700',
  online: 'text-indigo-700'
});
const money = (value, currencySymbol = '₱') => `${String(currencySymbol).toUpperCase() === 'PHP' ? '₱' : currencySymbol}${Number(value || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const resolveCurrencySymbol = (currencySymbol = '₱') => String(currencySymbol).toUpperCase() === 'PHP' ? '₱' : currencySymbol || '₱';
const formatDateTime = (value) => {
  const parsed = value ? new Date(value) : null;
  if (!parsed || Number.isNaN(parsed.getTime())) return { date: '—', time: '' };
  return { date: parsed.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }), time: parsed.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) };
};
const formatOrderMethod = (value) => {
  const normalized = String(value || '').trim().toLowerCase();
  return ORDER_METHOD_LABELS[normalized] || normalized.replace(/[_-]+/g, ' ').replace(/\b\w/g, (character) => character.toUpperCase()) || '—';
};
const normalizeToneKey = (value) => String(value || '').trim().toLowerCase().replace(/[_-]+/g, ' ');
const getPaymentMethodTone = (label) => PAYMENT_METHOD_TONES[normalizeToneKey(label)] || 'text-[#334155]';
const getOrderMethodTone = (label) => ORDER_METHOD_TONES[normalizeToneKey(label)] || 'text-[#334155]';
const renderPaymentMethods = (row) => {
  const labels = formatPosTransactionPaymentMethods(row).split(' + ');
  return (
    <span className="inline-flex flex-wrap items-center gap-x-1.5 gap-y-0.5 font-semibold">
      {labels.map((label, index) => (
        <span key={`${label}-${index}`} className="inline-flex items-center gap-1">
          <span className={getPaymentMethodTone(label)}>{label}</span>
          {index < labels.length - 1 ? <span className="text-slate-400">+</span> : null}
        </span>
      ))}
    </span>
  );
};
const renderOrderMethod = (row) => {
  const label = formatOrderMethod(row?.order_method);
  return <span className={`font-semibold ${getOrderMethodTone(label)}`}>{label}</span>;
};
const getInvoice = (row) => row?.invoice_number || row?.pos_transaction_id || '—';
const getCashier = (row) => row?.cashier_name || (row?.cashier_id ? `Cashier #${row.cashier_id}` : '—');
const getDiscount = (row) => Number(row?.discount_amount || 0);
const getGrossSales = (row) => Number(row?.gross_sales || 0);
const getNetSales = (row) => Number(row?.net_sales || 0);
const getProfitLoss = (row) => Number(row?.pos_profit_loss || 0);
const getProfitMargin = (row) => getNetSales(row) > 0 ? (getProfitLoss(row) / getNetSales(row)) * 100 : 0;
const getSearchValue = (row) => [formatDateTime(row?.created_at).date, formatDateTime(row?.created_at).time, getInvoice(row), getCashier(row), formatPosTransactionPaymentMethods(row), formatOrderMethod(row?.order_method), getDiscount(row), getGrossSales(row), getNetSales(row), getProfitLoss(row), getProfitMargin(row)].join(' ').toLowerCase();

export default function PosReportsSalesTable({ rows = [], currencySymbol = '₱', searchQuery = '' }) {
  const symbol = resolveCurrencySymbol(currencySymbol);
  const columns = useMemo(() => [
    { key: 'created_at', label: 'Date/Time', widthClass: 'w-[124px]', required: true, visibility: { mobile: true, tabletPortrait: true, tabletLandscape: true, desktop: true }, getValue: (row) => row?.created_at || '', getSortValue: (row) => new Date(row?.created_at || 0).getTime(), render: (row) => { const dateTime = formatDateTime(row?.created_at); return <span className="inline-flex flex-col leading-tight"><span>{dateTime.date}</span><span>{dateTime.time}</span></span>; } },
    { key: 'invoice_number', label: 'Transaction/Invoice', widthClass: 'w-[116px]', required: true, visibility: { mobile: true, tabletPortrait: true, tabletLandscape: true, desktop: true }, getValue: getInvoice },
    { key: 'cashier_name', label: 'Cashier', widthClass: 'w-[100px]', required: true, visibility: { mobile: false, tabletPortrait: true, tabletLandscape: true, desktop: true }, getValue: getCashier },
    { key: 'payment_methods', label: 'Payment Method', widthClass: 'w-[120px]', required: true, visibility: { mobile: false, tabletPortrait: false, tabletLandscape: true, desktop: true }, getValue: formatPosTransactionPaymentMethods, render: renderPaymentMethods },
    { key: 'order_method', label: 'Order Method', widthClass: 'w-[105px]', visibility: { mobile: false, tabletPortrait: false, tabletLandscape: false, desktop: true }, getValue: (row) => formatOrderMethod(row?.order_method), render: renderOrderMethod },
    { key: 'discount_amount', label: `Discount (${symbol})`, widthClass: 'w-[96px]', defaultVisible: false, visibility: { mobile: false, tabletPortrait: false, tabletLandscape: false, desktop: true }, align: 'left', numeric: true, getValue: getDiscount, render: (row) => money(getDiscount(row), currencySymbol) },
    { key: 'gross_sales', label: `Gross Sales (${symbol})`, widthClass: 'w-[112px]', defaultVisible: false, visibility: { mobile: false, tabletPortrait: false, tabletLandscape: false, desktop: true }, align: 'left', numeric: true, getValue: getGrossSales, render: (row) => money(getGrossSales(row), currencySymbol) },
    { key: 'net_sales', label: `Net Sales (${symbol})`, widthClass: 'w-[112px]', required: true, visibility: { mobile: true, tabletPortrait: true, tabletLandscape: true, desktop: true }, align: 'left', numeric: true, getValue: getNetSales, render: (row) => money(getNetSales(row), currencySymbol) },
    { key: 'profit_margin', label: 'Profit Margin (%)', widthClass: 'w-[112px]', defaultVisible: false, visibility: { mobile: false, tabletPortrait: false, tabletLandscape: false, desktop: true }, align: 'left', numeric: true, getValue: getProfitMargin, render: (row) => `${getProfitMargin(row).toFixed(2)}%` },
    { key: 'pos_profit_loss', label: `POS Profit/Loss (${symbol})`, widthClass: 'w-[124px]', required: true, visibility: { mobile: false, tabletPortrait: false, tabletLandscape: true, desktop: true }, align: 'left', numeric: true, getValue: getProfitLoss, render: (row) => <span className={getProfitLoss(row) >= 0 ? 'font-black text-emerald-600' : 'font-black text-rose-600'}>{money(getProfitLoss(row), currencySymbol)}</span> }
  ], [currencySymbol, symbol]);

  return <PosReportsResponsiveTable rows={rows} columns={columns} searchQuery={searchQuery} getSearchValue={getSearchValue} initialSort={{ key: 'created_at', direction: 'desc' }} ariaLabel="Sales transactions table" title="Sales transactions" idPrefix="pos-reports-sales" caption="Sales transactions with date, cashier, payment, order method, sales, and profit or loss." emptyMessage="No sales transactions were recorded for the selected filters." searchEmptyMessage="No sales transactions match your search." resultLabel="sales transactions" />;
}
