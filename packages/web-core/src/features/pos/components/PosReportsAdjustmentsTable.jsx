import { useMemo } from 'react';
import PosReportsResponsiveTable from './PosReportsResponsiveTable.jsx';
import { getPosReportValueToneClass } from './posReportValueTones.js';

const TYPE_LABELS = Object.freeze({ void: 'Void', cash_refund: 'Refund', external_refund: 'Refund', provider_refund: 'Refund', employee_credit_reversal: 'Employee Credit Reversal' });
const TYPE_TONES = Object.freeze({ void: 'danger', cash_refund: 'danger', external_refund: 'danger', provider_refund: 'danger', employee_credit_reversal: 'secondary' });
const normalizeType = (value) => String(value || '').trim().toLowerCase();
const formatType = (value) => { const normalized = normalizeType(value); return TYPE_LABELS[normalized] || normalized.replace(/[_-]+/g, ' ').replace(/\b\w/g, (character) => character.toUpperCase()) || '—'; };
const formatDateTime = (value) => { const parsed = value ? new Date(value) : null; if (!parsed || Number.isNaN(parsed.getTime())) return { date: '—', time: '' }; return { date: parsed.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }), time: parsed.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) }; };
const money = (value, currencyCode = 'PHP') => `${currencyCode === 'PHP' ? '₱' : currencyCode}${Number(value || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const resolveCurrencyCode = (currencySymbol = '₱') => String(currencySymbol).toUpperCase() === 'PHP' || currencySymbol === '₱' ? '₱' : currencySymbol || '₱';
const getReference = (row) => row?.adjustment_reference || row?.pos_transaction_adjustment_id || '—';
const getOrderNumber = (row) => row?.invoice_number || row?.pos_transaction_id || '—';
const getCashier = (row) => row?.original_cashier_name || (row?.original_cashier_id ? `Cashier #${row.original_cashier_id}` : '') || row?.actor_name || (row?.actor_user_id ? `User #${row.actor_user_id}` : '—');
const getReason = (row) => row?.reason || '—';
const getNotes = (row) => row?.failure_reason || row?.external_reference || row?.provider_reference || '—';
const getVoidedItems = (row) => {
  const lines = Array.isArray(row?.voided_lines) ? row.voided_lines : [];
  const labels = lines.map((line) => {
    const name = String(line?.item_name || '').trim() || (line?.item_id ? `Item #${line.item_id}` : '');
    const quantity = Number(line?.voided_quantity ?? line?.quantity ?? 0);
    if (!name) return '';
    return quantity > 0 ? `${name} × ${quantity}` : name;
  }).filter(Boolean);
  return labels.length > 0 ? labels.join(', ') : '—';
};
const getAffectedSales = (row) => row?.pos_transaction_id ? 'Yes' : 'No';
const getAmountTone = (row) => TYPE_TONES[normalizeType(row?.adjustment_type)] || (Number(row?.amount || 0) < 0 ? 'danger' : 'secondary');
const getSearchValue = (row) => [formatDateTime(row?.event_at).date, formatDateTime(row?.event_at).time, formatType(row?.adjustment_type), getReference(row), getOrderNumber(row), getCashier(row), getVoidedItems(row), getReason(row), row?.amount, getAffectedSales(row), getNotes(row)].join(' ').toLowerCase();

export default function PosReportsAdjustmentsTable({ rows = [], currencySymbol = '₱', searchQuery = '', idPrefix = 'pos-reports-adjustments' }) {
  const currencyCode = resolveCurrencyCode(currencySymbol);
  const columns = useMemo(() => [
    { key: 'event_at', label: 'Date/Time', valueTone: 'secondary', align: 'left', widthClass: 'w-[132px]', required: true, visibility: { mobile: true, tabletPortrait: true, tabletLandscape: true, desktop: true }, getValue: (row) => new Date(row?.event_at || 0).getTime() || 0, render: (row) => { const dateTime = formatDateTime(row?.event_at); return <span className="inline-flex flex-col leading-tight"><span>{dateTime.date}</span><span>{dateTime.time}</span></span>; } },
    { key: 'adjustment_type', label: 'Type', valueTone: (row) => TYPE_TONES[normalizeType(row?.adjustment_type)] || 'secondary', align: 'center', widthClass: 'w-[132px]', required: true, visibility: { mobile: true, tabletPortrait: true, tabletLandscape: true, desktop: true }, getValue: (row) => formatType(row?.adjustment_type), render: (row) => <span className="font-black">{formatType(row?.adjustment_type)}</span> },
    { key: 'adjustment_reference', label: 'Reference No.', valueTone: 'primary', align: 'center', widthClass: 'w-[164px]', required: true, visibility: { mobile: true, tabletPortrait: true, tabletLandscape: true, desktop: true }, getValue: getReference },
    { key: 'invoice_number', label: 'Order No.', align: 'center', widthClass: 'w-[128px]', defaultVisible: true, visibility: { mobile: false, tabletPortrait: false, tabletLandscape: true, desktop: true }, getValue: getOrderNumber },
    { key: 'voided_items', label: 'Voided Item(s)', valueTone: 'muted', align: 'left', widthClass: 'w-[190px]', defaultVisible: true, visibility: { mobile: false, tabletPortrait: false, tabletLandscape: true, desktop: true }, getValue: getVoidedItems },
    { key: 'original_cashier_name', label: 'Cashier', align: 'left', widthClass: 'w-[132px]', defaultVisible: true, visibility: { mobile: false, tabletPortrait: false, tabletLandscape: true, desktop: true }, getValue: getCashier },
    { key: 'reason', label: 'Reason', valueTone: 'muted', align: 'left', widthClass: 'w-[176px]', defaultVisible: false, visibility: { mobile: false, tabletPortrait: false, tabletLandscape: false, desktop: true }, getValue: getReason },
    { key: 'amount', label: `Amount (${currencyCode})`, valueTone: getAmountTone, align: 'left', widthClass: 'w-[120px]', required: true, visibility: { mobile: true, tabletPortrait: true, tabletLandscape: true, desktop: true }, getValue: (row) => Number(row?.amount || 0), render: (row) => <span className={`font-black ${getPosReportValueToneClass(getAmountTone(row))}`}>{money(row?.amount, currencyCode)}</span> },
    { key: 'affected_sales', label: 'Affected Sales', valueTone: 'secondary', align: 'center', widthClass: 'w-[124px]', defaultVisible: true, visibility: { mobile: false, tabletPortrait: false, tabletLandscape: true, desktop: true }, getValue: getAffectedSales, render: (row) => <span className="font-semibold">{getAffectedSales(row)}</span> },
    { key: 'notes', label: 'Notes', valueTone: 'muted', align: 'left', widthClass: 'w-[220px]', defaultVisible: false, visibility: { mobile: false, tabletPortrait: false, tabletLandscape: false, desktop: true }, getValue: getNotes }
  ], [currencyCode]);

  return <PosReportsResponsiveTable rows={rows} columns={columns} searchQuery={searchQuery} getSearchValue={getSearchValue} initialSort={{ key: 'event_at', direction: 'desc' }} ariaLabel="POS adjustments table" title="POS adjustments" idPrefix={idPrefix} caption="POS adjustments with date and time, type, reference, order, voided items, cashier, amount, affected sales, and notes." emptyMessage="No adjustments were recorded for these filters." searchEmptyMessage="No adjustments match your search." resultLabel="adjustments" maxDesktopColumns={8} showActions={false} />;
}
