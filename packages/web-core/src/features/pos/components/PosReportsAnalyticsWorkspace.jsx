import React, { useEffect, useMemo, useState } from 'react';
import { loadOfflinePosReportSnapshot, saveOfflinePosReportSnapshot } from '../services/offlinePosSnapshotStore.js';
import {
  ArrowDownRight,
  ArrowUpRight,
  Calendar,
  Download,
  Filter,
  Printer
} from 'lucide-react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from 'recharts';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  exportPosReportCsv,
  exportProcurementCsv,
  fetchPosReportsOverview
} from '../services/posService.js';
import EmployeeCreditReportPanel from './EmployeeCreditReportPanel.jsx';
import { formatPosTransactionPaymentMethods } from '../utils/posPaymentMethods.js';

const REPORT_SECTIONS = [
  { id: 'daily', label: 'Daily Report' },
  { id: 'attendance', label: 'Attendance' },
  { id: 'cashiers', label: 'Cashier Sales' },
  { id: 'registers', label: 'Registers' },
  { id: 'handoffs', label: 'Handoffs' },
  { id: 'monthly', label: 'Monthly Report' },
  { id: 'yearly', label: 'Yearly Report' },
  { id: 'comparison', label: 'Sales Comparison' },
  { id: 'profit_loss', label: 'POS Profit/Loss' }
];

const REPORT_SECTION_GRANULARITY = {
  daily: 'daily',
  attendance: 'daily',
  cashiers: 'daily',
  registers: 'daily',
  handoffs: 'daily',
  monthly: 'monthly',
  yearly: 'yearly',
  comparison: 'weekly',
  profit_loss: 'monthly'
};

const PAYMENT_OPTIONS = [
  { value: '', label: 'All payments' },
  { value: 'cash', label: 'Cash' },
  { value: 'gcash', label: 'GCash' },
  { value: 'card', label: 'Card' },
  { value: 'maya', label: 'Online' },
  { value: 'bank_transfer', label: 'Bank Transfer' },
  { value: 'employee_credit', label: 'Employee Credit' }
];

const SOURCE_OPTIONS = [
  { value: '', label: 'All sources' },
  { value: 'in_store', label: 'In-Store' },
  { value: 'online_store', label: 'Online Store' },
  { value: 'delivery', label: 'Delivery' },
  { value: 'pickup', label: 'Pickup' }
];

const GRANULARITY_OPTIONS = [
  { value: 'daily', label: 'Daily' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'monthly', label: 'Monthly' },
  { value: 'yearly', label: 'Yearly' }
];

const CHART_COLORS = ['#2563EB', '#14B8A6', '#F97316', '#0EA5E9', '#8B5CF6'];
const ORDER_METHOD_LABELS = {
  dine_in: 'Dine-In',
  takeout: 'Takeout',
  online: 'Online',
  pickup: 'Pickup',
  delivery: 'Delivery'
};

const money = (value, currencySymbol = 'PHP') => `${currencySymbol} ${Number(value || 0).toFixed(2)}`;
const percent = (value) => `${Number(value || 0).toFixed(1)}%`;
const displayDiscountType = (value) => String(value || '').trim().toLowerCase() === 'manual'
  ? 'Other'
  : String(value || '').replace(/[_-]+/g, ' ').replace(/\b\w/g, (character) => character.toUpperCase());
const escapeHtml = (value) => String(value ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#039;');
const printDateTime = (value) => {
  if (!value) return '-';
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? '-' : parsed.toLocaleString();
};

const toDateInput = (date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const normalizeReportDateInput = (value) => {
  const raw = String(value || '').trim();
  if (!raw) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;

  const slashMatch = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (slashMatch) {
    const [, first, second, year] = slashMatch;
    const month = String(Number(first)).padStart(2, '0');
    const day = String(Number(second)).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return raw;
  return toDateInput(parsed);
};

const addDays = (date, days) => {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
};

const getDefaultRange = (granularity = 'daily') => {
  const now = new Date();
  if (granularity === 'weekly') {
    const day = now.getDay();
    const mondayDelta = day === 0 ? -6 : 1 - day;
    const start = addDays(now, mondayDelta);
    return { dateFrom: toDateInput(start), dateTo: toDateInput(now) };
  }
  if (granularity === 'monthly') {
    return {
      dateFrom: toDateInput(new Date(now.getFullYear(), now.getMonth(), 1)),
      dateTo: toDateInput(now)
    };
  }
  if (granularity === 'yearly') {
    return {
      dateFrom: toDateInput(new Date(now.getFullYear(), 0, 1)),
      dateTo: toDateInput(now)
    };
  }
  return { dateFrom: toDateInput(now), dateTo: toDateInput(now) };
};

const downloadBlob = (blob, filename) => {
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  window.URL.revokeObjectURL(url);
};

const deltaTone = (value) => (Number(value || 0) >= 0
  ? 'text-emerald-700 bg-emerald-50 border-emerald-200'
  : 'text-rose-700 bg-rose-50 border-rose-200');

const formatOrderMethod = (value) => ORDER_METHOD_LABELS[String(value || '').trim().toLowerCase()] || String(value || 'Unknown')
  .replace(/_/g, ' ')
  .replace(/\b\w/g, (char) => char.toUpperCase());

const MetricCard = ({ label, value, tone = 'default', hint = '' }) => {
  const toneClass = tone === 'positive'
    ? 'border-emerald-200 bg-emerald-50/70'
    : tone === 'negative'
      ? 'border-rose-200 bg-rose-50/70'
      : 'border-slate-200 bg-white';

  return (
    <div className={`rounded-2xl border px-4 py-4 shadow-sm shadow-slate-200/70 ${toneClass}`}>
      <p className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-500">{label}</p>
      <p className="mt-2 text-[26px] font-black leading-none text-slate-950">{value}</p>
      {hint ? <p className="mt-2 text-xs font-medium text-slate-500">{hint}</p> : null}
    </div>
  );
};

const SectionCard = ({ title, actions = null, children, className = '' }) => (
  <section className={`min-w-0 max-w-full overflow-hidden rounded-2xl border border-slate-200 bg-white p-4 shadow-sm shadow-slate-200/60 ${className}`}>
    <div className="mb-4 flex min-w-0 items-center justify-between gap-3">
      <h3 className="min-w-0 text-sm font-black text-slate-950">{title}</h3>
      {actions}
    </div>
    {children}
  </section>
);

const EmptyState = ({ message }) => (
  <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-12 text-center text-sm font-semibold text-slate-500">
    {message}
  </div>
);

const DataTable = ({ columns = [], rows = [], emptyMessage = 'No rows found.' }) => (
  <div className="min-w-0 max-w-full">
    {rows.length > 0 ? (
      <div className="grid min-w-0 gap-3 sm:hidden">
        {rows.map((row, index) => (
          <div key={`mobile-${row.id || row.key || index}`} className="min-w-0 rounded-2xl border border-slate-200 bg-white px-4 py-3">
            {columns.map((column) => (
              <div key={`mobile-${column.key}-${index}`} className="flex min-w-0 items-start justify-between gap-4 border-b border-slate-100 py-2 last:border-b-0">
                <span className="min-w-0 text-[11px] font-black uppercase tracking-[0.12em] text-slate-500">{column.label}</span>
                <span className="min-w-0 break-words text-right text-sm font-semibold text-slate-700">
                  {typeof column.render === 'function' ? column.render(row) : row[column.key]}
                </span>
              </div>
            ))}
          </div>
        ))}
      </div>
    ) : (
      <div className="rounded-2xl border border-slate-200 px-4 py-10 text-center text-sm font-semibold text-slate-500 sm:hidden">
        {emptyMessage}
      </div>
    )}

    <div className="hidden min-w-0 max-w-full overflow-x-auto overscroll-x-contain rounded-2xl border border-slate-200 sm:block">
      <table className="w-full min-w-[720px] text-sm">
        <thead className="bg-slate-50 text-[11px] uppercase tracking-[0.16em] text-slate-500">
          <tr>
            {columns.map((column) => (
              <th key={column.key} className={`px-4 py-3 font-black ${column.align === 'right' ? 'text-right' : 'text-left'}`}>
                {column.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.length > 0 ? rows.map((row, index) => (
            <tr key={`${row.id || row.key || index}`} className="text-slate-700">
              {columns.map((column) => (
                <td key={`${column.key}-${index}`} className={`px-4 py-3 ${column.align === 'right' ? 'text-right' : 'text-left'}`}>
                  {typeof column.render === 'function' ? column.render(row) : row[column.key]}
                </td>
              ))}
            </tr>
          )) : (
            <tr>
              <td colSpan={columns.length} className="px-4 py-10 text-center text-sm font-semibold text-slate-500">
                {emptyMessage}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  </div>
);

function PosReportsAnalyticsWorkspace({
  terminalMeta,
  reportRefreshKey = 0,
  employeeCreditReportRefreshKey = 0,
  isOnline = true,
  offlineSnapshotScope = {},
  sectionId
}) {
  const [activeSection, setActiveSection] = useState('daily');
  const [granularity, setGranularity] = useState('daily');
  const [dateRange, setDateRange] = useState(() => getDefaultRange('daily'));
  const [cashierId, setCashierId] = useState('');
  const [paymentType, setPaymentType] = useState('');
  const [source, setSource] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [reportData, setReportData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const currencySymbol = terminalMeta?.pettyCashSymbol || 'PHP';
  const normalizedDateRange = useMemo(() => ({
    dateFrom: normalizeReportDateInput(dateRange.dateFrom),
    dateTo: normalizeReportDateInput(dateRange.dateTo)
  }), [dateRange.dateFrom, dateRange.dateTo]);
  const offlineReportKey = useMemo(() => JSON.stringify({
    granularity,
    dateFrom: normalizedDateRange.dateFrom,
    dateTo: normalizedDateRange.dateTo,
    cashierId,
    paymentType,
    source,
    categoryId
  }), [categoryId, cashierId, granularity, normalizedDateRange.dateFrom, normalizedDateRange.dateTo, paymentType, source]);

  const handleSectionChange = (sectionId) => {
    const nextSection = String(sectionId || 'daily').trim() || 'daily';
    const nextGranularity = REPORT_SECTION_GRANULARITY[nextSection] || 'daily';
    setActiveSection(nextSection);
    setGranularity(nextGranularity);
    setDateRange(getDefaultRange(nextGranularity));
  };

  useEffect(() => {
    setDateRange(getDefaultRange(granularity));
  }, [granularity]);

  useEffect(() => {
    let cancelled = false;

    const loadReports = async () => {
      setLoading(true);
      setError('');
      if (!isOnline) {
        const snapshot = loadOfflinePosReportSnapshot(offlineSnapshotScope, offlineReportKey);
        if (!cancelled) {
          setReportData(snapshot?.payload || null);
          setError(snapshot ? 'Offline estimate from the last synced report. Pending local sales are not final until Sync completes.' : 'No cached report exists for this filter. Reconnect once to load it.');
          setLoading(false);
        }
        return;
      }
      try {
        const payload = await fetchPosReportsOverview({
          granularity,
          date_from: normalizedDateRange.dateFrom,
          date_to: normalizedDateRange.dateTo,
          cashier_id: cashierId || undefined,
          payment_type: paymentType || undefined,
          source: source || undefined,
          category_id: categoryId || undefined
        });
        if (!cancelled) {
          setReportData(payload);
          saveOfflinePosReportSnapshot(offlineSnapshotScope, offlineReportKey, payload);
        }
      } catch (loadError) {
        if (!cancelled) {
          setReportData((current) => current || null);
          setError(loadError?.response?.data?.message || 'Failed to load POS reports.');
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    loadReports();
    return () => {
      cancelled = true;
    };
  }, [categoryId, cashierId, granularity, isOnline, normalizedDateRange.dateFrom, normalizedDateRange.dateTo, offlineReportKey, offlineSnapshotScope, paymentType, reportRefreshKey, source]);

  const summaryCards = reportData?.summary_cards || {};
  const selectedTender = summaryCards.selected_tender || null;
  const filterOptions = reportData?.filter_options || {};
  const dailyReport = reportData?.daily_report || {};
  const monthlyReport = reportData?.monthly_report || {};
  const yearlyReport = reportData?.yearly_report || {};
  const comparisonReport = reportData?.sales_comparison || {};
  const profitLoss = reportData?.profit_loss || {};
  const cashierLifecycle = reportData?.cashier_lifecycle || {};
  const isLifecycleSection = ['attendance', 'cashiers', 'registers', 'handoffs'].includes(activeSection);

  const trendSeries = useMemo(() => {
    if (activeSection === 'monthly') return monthlyReport.sales_trend || [];
    if (activeSection === 'yearly') return yearlyReport.monthly_breakdown || [];
    if (activeSection === 'comparison') return comparisonReport.monthly_trend || [];
    return dailyReport.trend || [];
  }, [activeSection, comparisonReport.monthly_trend, dailyReport.trend, monthlyReport.sales_trend, yearlyReport.monthly_breakdown]);

  const paymentChartRows = (dailyReport.payment_breakdown || []).map((entry, index) => ({
    ...entry,
    fill: CHART_COLORS[index % CHART_COLORS.length]
  }));
  const orderMethodRows = dailyReport.order_method_breakdown || [];
  const isInitialLoading = loading && !reportData;
  const isRefreshing = loading && Boolean(reportData);
  const showBlockingError = Boolean(error) && !reportData;
  const showInlineError = Boolean(error) && Boolean(reportData);

  const hasData = Boolean(reportData) && (
    Number(summaryCards.total_transactions || 0) > 0
    || Number(summaryCards.total_sales || 0) > 0
    || Number(dailyReport.adjustment_summary?.adjustment_count || 0) > 0
    || (trendSeries || []).length > 0
  );

  const cashiers = Array.isArray(filterOptions.cashiers) ? filterOptions.cashiers : [];
  const categories = (Array.isArray(filterOptions.categories) ? filterOptions.categories : []).map((entry) => (
    typeof entry === 'string'
      ? { folder_id: null, name: entry, legacy: true }
      : entry
  ));
  const transactionRows = Array.isArray(dailyReport.transaction_rows) ? dailyReport.transaction_rows : [];
  const selectedCashier = cashiers.find((entry) => String(entry.cashier_id) === String(cashierId));
  const reportCashierLabel = cashierId
    ? (selectedCashier?.cashier_name || `Cashier #${cashierId}`)
    : 'All cashiers';

  const handleExportCsv = async () => {
    const { blob, filename } = await exportPosReportCsv({
      section: activeSection,
      granularity,
      date_from: normalizedDateRange.dateFrom,
      date_to: normalizedDateRange.dateTo,
      cashier_id: cashierId || undefined,
      payment_type: paymentType || undefined,
      source: source || undefined,
      category_id: categoryId || undefined
    });
    downloadBlob(blob, filename);
  };

  // Phase 261 (#1488): pre-run procurement CSV export -- no params, matches handleExportCsv's own
  // lack of a location_id filter today.
  const handleExportProcurementCsv = async () => {
    const { blob, filename } = await exportProcurementCsv();
    downloadBlob(blob, filename);
  };

  const handlePrint = () => {
    if (typeof window === 'undefined' || !reportData) return;
    const printWindow = window.open('', '_blank', 'width=1120,height=900');
    if (!printWindow) return;

    const topItems = (dailyReport.top_items || []).slice(0, 10).map((item) => `
      <tr>
        <td>${escapeHtml(item.item_name)}</td>
        <td>${escapeHtml(item.sku_code || '-')}</td>
        <td style="text-align:right">${Number(item.quantity || 0).toFixed(2)}</td>
        <td style="text-align:right">${escapeHtml(money(item.net_sales, currencySymbol))}</td>
        <td style="text-align:right">${escapeHtml(money(item.pos_profit_loss, currencySymbol))}</td>
      </tr>
    `).join('');
    const cashierRows = (dailyReport.cashier_summary || []).map((entry) => {
      const cash = entry?.shift_money || {};
      return `
        <tr>
          <td>${escapeHtml(entry.cashier_name || '-')}</td>
          <td style="text-align:right">${Number(cash.shift_count || entry.shift_ids?.length || 0)}</td>
          <td style="text-align:right">${Number(cash.closed_shift_count || 0)}</td>
          <td style="text-align:right">${escapeHtml(money(cash.opening_float_amount, currencySymbol))}</td>
          <td style="text-align:right">${escapeHtml(money(cash.cash_sales_amount, currencySymbol))}</td>
          <td style="text-align:right">${escapeHtml(money(cash.cash_in_total, currencySymbol))}</td>
          <td style="text-align:right">${escapeHtml(money(cash.cash_out_total, currencySymbol))}</td>
          <td style="text-align:right">${escapeHtml(money(cash.expected_cash_amount, currencySymbol))}</td>
          <td style="text-align:right">${cash.closing_cash_amount == null ? '-' : escapeHtml(money(cash.closing_cash_amount, currencySymbol))}</td>
          <td style="text-align:right">${cash.cash_variance_amount == null ? '-' : escapeHtml(money(cash.cash_variance_amount, currencySymbol))}</td>
        </tr>
      `;
    }).join('');
    const filteredTransactions = transactionRows.map((entry) => `
      <tr>
        <td>${escapeHtml(entry.invoice_number || entry.pos_transaction_id || '-')}</td>
        <td>${escapeHtml(printDateTime(entry.created_at))}</td>
        <td>${escapeHtml(entry.cashier_name || '-')}</td>
        <td>${escapeHtml(formatPosTransactionPaymentMethods(entry))}</td>
        <td>${escapeHtml(entry.status || '-')}</td>
        <td style="text-align:right">${escapeHtml(money(entry.total_amount, currencySymbol))}</td>
        <td style="text-align:right">${escapeHtml(money(entry.net_sales, currencySymbol))}</td>
      </tr>
    `).join('');

    printWindow.document.write(`
      <html>
        <head>
          <title>Cashier Sales & Cash Reconciliation</title>
          <style>
            body { font-family: Arial, sans-serif; padding: 24px; color: #0f172a; }
            h1 { margin: 0 0 8px; font-size: 28px; }
            p { margin: 0 0 12px; color: #475569; }
            .grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin: 20px 0; }
            .card { border: 1px solid #cbd5e1; border-radius: 14px; padding: 14px; }
            .label { font-size: 11px; text-transform: uppercase; letter-spacing: 0.14em; color: #64748b; font-weight: 700; }
            .value { font-size: 24px; font-weight: 800; margin-top: 8px; }
            table { width: 100%; border-collapse: collapse; margin-top: 18px; }
            th, td { border: 1px solid #e2e8f0; padding: 10px; font-size: 12px; }
            th { background: #f8fafc; text-transform: uppercase; letter-spacing: 0.08em; text-align: left; }
            .section { page-break-inside: avoid; margin-top: 24px; }
          </style>
        </head>
        <body>
          <h1>Cashier Sales & Cash Reconciliation</h1>
          <p>Cashier: ${escapeHtml(reportCashierLabel)}</p>
          <p>Range: ${escapeHtml(normalizedDateRange.dateFrom)} to ${escapeHtml(normalizedDateRange.dateTo)}</p>
          <div class="grid">
            <div class="card"><div class="label">Total Sales</div><div class="value">${escapeHtml(money(summaryCards.total_sales, currencySymbol))}</div></div>
            <div class="card"><div class="label">Transactions</div><div class="value">${Number(summaryCards.total_transactions || 0)}</div></div>
            <div class="card"><div class="label">Gross Sales</div><div class="value">${escapeHtml(money(summaryCards.gross_sales, currencySymbol))}</div></div>
            <div class="card"><div class="label">All Discounts</div><div class="value">${escapeHtml(money(dailyReport.summary?.discounts, currencySymbol))}</div></div>
            <div class="card"><div class="label">POS Profit/Loss</div><div class="value">${escapeHtml(money(summaryCards.pos_profit_loss, currencySymbol))}</div></div>
            ${selectedTender ? `<div class="card"><div class="label">${escapeHtml(selectedTender.payment_label)} Collected</div><div class="value">${escapeHtml(money(selectedTender.amount, currencySymbol))}</div></div>` : ''}
          </div>
          <div class="section">
            <h2>Cash Reconciliation</h2>
            <table>
              <thead><tr><th>Cashier</th><th>Shifts</th><th>Closed</th><th>Opening Float</th><th>Cash Sales</th><th>Cash In</th><th>Cash Out</th><th>Expected Cash</th><th>Closing Cash</th><th>Variance</th></tr></thead>
              <tbody>${cashierRows || '<tr><td colspan="10">No shift cash records found.</td></tr>'}</tbody>
            </table>
          </div>
          <div class="section">
            <h2>Filtered Transactions</h2>
            <table>
              <thead><tr><th>Invoice</th><th>Datetime</th><th>Cashier</th><th>Payment</th><th>Status</th><th>Total</th><th>Reported Net Sales</th></tr></thead>
              <tbody>${filteredTransactions || '<tr><td colspan="7">No transactions found.</td></tr>'}</tbody>
            </table>
          </div>
          <div class="section">
            <h2>Daily Top Items</h2>
            <table>
              <thead><tr><th>Item</th><th>SKU</th><th>Qty</th><th>Net Sales</th><th>POS Profit/Loss</th></tr></thead>
              <tbody>${topItems || '<tr><td colspan="5">No rows found.</td></tr>'}</tbody>
            </table>
          </div>
        </body>
      </html>
    `);
    printWindow.document.close();
    printWindow.focus();
    printWindow.print();
  };

  const comparisonCards = comparisonReport.fixed_periods || [];

  return (
    <div id={sectionId} className="min-w-0 max-w-full overflow-x-hidden space-y-4">
      <div className="flex min-w-0 max-w-full flex-col gap-4">
      <div className="flex flex-col gap-3 sm:hidden">
        <div className="flex items-center gap-2">
          <label className="min-w-0 flex-1 space-y-1.5">
            <span className="text-[11px] font-black uppercase tracking-[0.16em] text-slate-500">Payment</span>
            <select className="h-11 w-full rounded-xl border border-slate-200 px-2 text-xs font-semibold text-slate-900" value={paymentType} onChange={(event) => setPaymentType(event.target.value)}>
              {PAYMENT_OPTIONS.map((option) => <option key={option.value || 'all'} value={option.value}>{option.label}</option>)}
            </select>
          </label>
          <label className="min-w-0 flex-1 space-y-1.5">
            <span className="text-[11px] font-black uppercase tracking-[0.16em] text-slate-500">Source</span>
            <select className="h-11 w-full rounded-xl border border-slate-200 px-2 text-xs font-semibold text-slate-900" value={source} onChange={(event) => setSource(event.target.value)}>
              {SOURCE_OPTIONS.map((option) => <option key={option.value || 'all'} value={option.value}>{option.label}</option>)}
            </select>
          </label>
        </div>
        <label className="space-y-1.5">
          <span className="text-[11px] font-black uppercase tracking-[0.16em] text-slate-500">Category</span>
          <select className="h-11 w-full rounded-xl border border-slate-200 px-2 text-xs font-semibold text-slate-900" value={categoryId} onChange={(event) => setCategoryId(event.target.value)}>
            <option value="">All categories</option>
            {categories.map((entry) => <option key={entry.folder_id || entry.name} value={entry.folder_id || ''} disabled={!entry.folder_id}>{entry.name}</option>)}
          </select>
        </label>
        <div className="flex h-11 w-full items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm font-semibold text-slate-600">
          <Filter className="h-4 w-4 text-[#2563EB]" />
          POS-only reporting with IMS cost data
        </div>
      </div>
      <section className="order-2 min-w-0 max-w-full overflow-hidden rounded-2xl border border-slate-200 bg-white p-4 shadow-sm shadow-slate-200/70 md:order-1">
        <div className="grid min-w-0 gap-3 md:grid-cols-2 xl:grid-cols-[1.2fr_1.2fr_1fr_1fr_auto_auto]">
          <div className="grid min-w-0 grid-cols-1 gap-3 sm:contents">
            <label className="min-w-0 space-y-1.5">
              <span className="text-[11px] font-black uppercase tracking-[0.16em] text-slate-500">Date from</span>
              <div className="relative">
                <Input type="date" value={dateRange.dateFrom} onChange={(event) => setDateRange((prev) => ({ ...prev, dateFrom: event.target.value }))} className="pos-report-date-input h-11 w-full min-w-0 max-w-full rounded-xl pr-9 md:pr-3" />
                <Calendar className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400 md:hidden" />
              </div>
            </label>
            <label className="min-w-0 space-y-1.5">
              <span className="text-[11px] font-black uppercase tracking-[0.16em] text-slate-500">Date to</span>
              <div className="relative">
                <Input type="date" value={dateRange.dateTo} min={dateRange.dateFrom} onChange={(event) => setDateRange((prev) => ({ ...prev, dateTo: event.target.value }))} className="pos-report-date-input h-11 w-full min-w-0 max-w-full rounded-xl pr-9 md:pr-3" />
                <Calendar className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400 md:hidden" />
              </div>
            </label>
          </div>
          <div className="grid min-w-0 grid-cols-1 gap-3 sm:contents">
            <label className="min-w-0 space-y-1.5">
              <span className="text-[11px] font-black uppercase tracking-[0.16em] text-slate-500">Range</span>
              <select className="h-11 w-full rounded-xl border border-slate-200 px-3 text-sm font-semibold text-slate-900" value={granularity} onChange={(event) => setGranularity(event.target.value)}>
                {GRANULARITY_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
            </label>
            <label className="min-w-0 space-y-1.5">
              <span className="text-[11px] font-black uppercase tracking-[0.16em] text-slate-500">Cashier</span>
              <select className="h-11 w-full rounded-xl border border-slate-200 px-3 text-sm font-semibold text-slate-900" value={cashierId} onChange={(event) => setCashierId(event.target.value)}>
                <option value="">All cashiers</option>
                {cashiers.map((cashier) => <option key={cashier.cashier_id} value={cashier.cashier_id}>{cashier.cashier_name}</option>)}
              </select>
            </label>
          </div>
          <Button type="button" variant="outline" className="h-11 min-w-0 rounded-xl border-slate-200 px-4 font-extrabold" onClick={handleExportCsv} disabled={!reportData}>
            <Download className="mr-2 h-4 w-4" />
            Export CSV
          </Button>
          <Button type="button" variant="outline" className="h-11 min-w-0 rounded-xl border-slate-200 px-4 font-extrabold" onClick={handleExportProcurementCsv}>
            <Download className="mr-2 h-4 w-4" />
            Procurement CSV
          </Button>
          <Button type="button" className="h-11 min-w-0 rounded-xl bg-[#2563EB] px-4 font-extrabold text-white hover:bg-[#1D4ED8]" onClick={handlePrint} disabled={!reportData}>
            <Printer className="mr-2 h-4 w-4" />
            Print / Save PDF
          </Button>
        </div>

        <div className="mt-3 hidden gap-3 sm:grid lg:grid-cols-4">
          <label className="space-y-1.5">
            <span className="text-[11px] font-black uppercase tracking-[0.16em] text-slate-500">Payment</span>
            <select className="h-11 w-full rounded-xl border border-slate-200 px-3 text-sm font-semibold text-slate-900" value={paymentType} onChange={(event) => setPaymentType(event.target.value)}>
              {PAYMENT_OPTIONS.map((option) => <option key={option.value || 'all'} value={option.value}>{option.label}</option>)}
            </select>
          </label>
          <label className="space-y-1.5">
            <span className="text-[11px] font-black uppercase tracking-[0.16em] text-slate-500">Source</span>
            <select className="h-11 w-full rounded-xl border border-slate-200 px-3 text-sm font-semibold text-slate-900" value={source} onChange={(event) => setSource(event.target.value)}>
              {SOURCE_OPTIONS.map((option) => <option key={option.value || 'all'} value={option.value}>{option.label}</option>)}
            </select>
          </label>
          <label className="space-y-1.5">
            <span className="text-[11px] font-black uppercase tracking-[0.16em] text-slate-500">Category</span>
            <select className="h-11 w-full rounded-xl border border-slate-200 px-3 text-sm font-semibold text-slate-900" value={categoryId} onChange={(event) => setCategoryId(event.target.value)}>
              <option value="">All categories</option>
              {categories.map((entry) => <option key={entry.folder_id || entry.name} value={entry.folder_id || ''} disabled={!entry.folder_id}>{entry.name}</option>)}
            </select>
          </label>
          <div className="flex items-end">
            <div className="flex h-11 w-full items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm font-semibold text-slate-600">
              <Filter className="h-4 w-4 text-[#2563EB]" />
              POS-only reporting with IMS cost data
            </div>
          </div>
        </div>
      </section>

      <div className={`order-1 grid gap-3 md:order-2 md:grid-cols-2 ${selectedTender ? 'xl:grid-cols-6' : 'xl:grid-cols-5'}`}>
        <MetricCard label="Total Sales" value={money(summaryCards.total_sales, currencySymbol)} hint={selectedTender ? 'Sales across all tenders in matching transactions' : undefined} />
        <MetricCard label="Transactions" value={Number(summaryCards.total_transactions || 0)} />
        <MetricCard label="Gross Sales" value={money(summaryCards.gross_sales, currencySymbol)} />
        <MetricCard label="All Discounts" value={money(dailyReport.summary?.discounts, currencySymbol)} />
        <MetricCard
          label="POS Profit/Loss"
          value={money(summaryCards.pos_profit_loss, currencySymbol)}
          tone={Number(summaryCards.pos_profit_loss || 0) >= 0 ? 'positive' : 'negative'}
        />
        {selectedTender && (
          <MetricCard
            label={`${selectedTender.payment_label} Collected`}
            value={money(selectedTender.amount, currencySymbol)}
            hint={`${Number(selectedTender.transaction_count || 0)} completed transactions; whole-transaction tender, excluding voids/refunds`}
          />
        )}
      </div>
      </div>

      <div className="overflow-x-auto pb-1">
        <div className="flex min-w-max flex-nowrap gap-3">
          {REPORT_SECTIONS.map((section) => {
            const isActive = activeSection === section.id;
            return (
              <button
                key={section.id}
                type="button"
                onClick={() => handleSectionChange(section.id)}
                className={`inline-flex h-11 items-center justify-center rounded-full border px-5 text-sm font-black transition ${
                  isActive
                    ? 'border-[#2563EB] bg-[#2563EB] text-white shadow-lg shadow-blue-200/70'
                    : 'border-slate-200 bg-white text-slate-700 hover:border-blue-200 hover:bg-blue-50 hover:text-[#1D4ED8]'
                }`}
              >
                {section.label}
              </button>
            );
          })}
        </div>
      </div>

      {showInlineError ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-800">
          {error}
        </div>
      ) : null}

      {isInitialLoading ? (
        <EmptyState message="Loading POS reports..." />
      ) : showBlockingError ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-10 text-center text-sm font-semibold text-rose-700">{error}</div>
      ) : !hasData ? (
        <EmptyState message="No POS report data found for the selected filters." />
      ) : (
        <div className="relative space-y-4">
          {isRefreshing ? (
            <div className="flex items-center justify-end">
              <div className="inline-flex items-center gap-2 rounded-full border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-black text-[#1D4ED8]">
                <span className="h-2 w-2 animate-pulse rounded-full bg-[#2563EB]" />
                Updating report...
              </div>
            </div>
          ) : null}

          <div className={isRefreshing ? 'opacity-80 transition-opacity' : 'transition-opacity'}>
          {!isLifecycleSection ? <div className="grid gap-4 xl:grid-cols-[1.3fr_0.9fr]">
            <SectionCard title={activeSection === 'comparison' ? 'Comparison Trend' : activeSection === 'yearly' ? 'Yearly Breakdown' : activeSection === 'monthly' ? 'Monthly Trend' : 'Sales Trend'}>
              <div className="h-[280px]">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={trendSeries}>
                    <defs>
                      <linearGradient id="reportTrendFill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#2563EB" stopOpacity={0.28} />
                        <stop offset="95%" stopColor="#2563EB" stopOpacity={0.03} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid stroke="#E2E8F0" strokeDasharray="3 3" />
                    <XAxis dataKey="label" stroke="#64748B" fontSize={11} />
                    <YAxis stroke="#64748B" fontSize={11} />
                    <Tooltip formatter={(value) => money(value, currencySymbol)} />
                    <Area type="monotone" dataKey="net_sales" stroke="#2563EB" fill="url(#reportTrendFill)" strokeWidth={2.5} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </SectionCard>

            <SectionCard title="Payment Breakdown">
              <div className="h-[280px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={paymentChartRows}>
                    <CartesianGrid stroke="#E2E8F0" strokeDasharray="3 3" />
                    <XAxis dataKey="payment_method" stroke="#64748B" fontSize={11} />
                    <YAxis stroke="#64748B" fontSize={11} />
                    <Tooltip formatter={(value) => money(value, currencySymbol)} />
                    <Bar dataKey="net_sales" radius={[8, 8, 0, 0]}>
                      {paymentChartRows.map((entry) => <Cell key={`payment-cell-${entry.payment_method}`} fill={entry.fill} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </SectionCard>
          </div> : null}

          {activeSection === 'daily' ? (
            <div className="space-y-4">
              <SectionCard title="Daily Summary">
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
                  <MetricCard label="Business Date" value={dateRange.dateFrom === dateRange.dateTo ? dateRange.dateFrom : `${dateRange.dateFrom} to ${dateRange.dateTo}`} hint="Filtered report date" />
                  <MetricCard label="Transactions" value={Number(dailyReport.summary?.total_transactions || 0)} />
                  <MetricCard label="Gross Sales" value={money(dailyReport.summary?.gross_sales, currencySymbol)} />
                  <MetricCard label="Net Sales" value={money(dailyReport.summary?.net_sales, currencySymbol)} />
                  <MetricCard label="Discounts" value={money(dailyReport.summary?.discounts, currencySymbol)} />
                  <MetricCard label="Refunds/Voids" value={money(dailyReport.summary?.refunds_voids, currencySymbol)} tone={Number(dailyReport.summary?.refunds_voids || 0) > 0 ? 'negative' : 'default'} />
                  <MetricCard label="VAT" value={money(dailyReport.summary?.vat, currencySymbol)} />
                  <MetricCard label="Service Fees" value={money(dailyReport.summary?.service_fees, currencySymbol)} />
                  <MetricCard label="POS Profit/Loss" value={money(dailyReport.summary?.pos_profit_loss, currencySymbol)} tone={Number(dailyReport.summary?.pos_profit_loss || 0) >= 0 ? 'positive' : 'negative'} />
                  <MetricCard label="Profit Margin" value={percent(dailyReport.summary?.profit_margin)} tone={Number(dailyReport.summary?.pos_profit_loss || 0) >= 0 ? 'positive' : 'negative'} />
                </div>
              </SectionCard>

              <SectionCard title="Refund & Adjustment Events">
                <p className="mb-3 text-xs font-semibold text-slate-500">
                  These rows use the refund/adjustment event timestamp. They disclose after-close activity without changing a prior Z-reading or subtracting an already-voided sale twice.
                </p>
                <div className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                  <MetricCard label="Adjustment events" value={Number(dailyReport.adjustment_summary?.adjustment_count || 0)} />
                  <MetricCard label="Completed amount" value={money(dailyReport.adjustment_summary?.succeeded_amount, currencySymbol)} />
                  <MetricCard label="Pending amount" value={money(dailyReport.adjustment_summary?.pending_amount, currencySymbol)} tone={Number(dailyReport.adjustment_summary?.pending_amount || 0) > 0 ? 'negative' : 'default'} />
                  <MetricCard label="Manual review" value={money(dailyReport.adjustment_summary?.manual_review_amount, currencySymbol)} tone={Number(dailyReport.adjustment_summary?.manual_review_amount || 0) > 0 ? 'negative' : 'default'} />
                </div>
                <DataTable
                  columns={[
                    { key: 'event_at', label: 'Event Datetime', render: (row) => printDateTime(row.event_at) },
                    { key: 'invoice_number', label: 'Invoice', render: (row) => row.invoice_number || row.pos_transaction_id },
                    { key: 'adjustment_type', label: 'Action', render: (row) => String(row.adjustment_type || '').replace(/_/g, ' ') },
                    { key: 'status', label: 'Status', render: (row) => String(row.status || '').replace(/_/g, ' ') },
                    { key: 'amount', label: 'Amount', align: 'right', render: (row) => money(row.amount, currencySymbol) },
                    { key: 'original_cashier_name', label: 'Original Cashier', render: (row) => row.original_cashier_name || row.original_cashier_id || '-' },
                    { key: 'actor_name', label: 'Actioned By', render: (row) => row.actor_name || row.actor_user_id || '-' },
                    { key: 'actor_shift_id', label: 'Actor Shift', render: (row) => row.actor_shift_id || 'No shift' },
                    { key: 'adjustment_reference', label: 'Reference' }
                  ]}
                  rows={Array.isArray(dailyReport.adjustment_rows) ? dailyReport.adjustment_rows : []}
                  emptyMessage="No refund or adjustment events were recorded in this event-date range."
                />
              </SectionCard>

              <div className="grid gap-4 xl:grid-cols-2">
                <SectionCard title="All Discounts">
                  <DataTable
                    columns={[
                      { key: 'discount_label', label: 'Discount' },
                      { key: 'discount_type', label: 'Type' },
                      { key: 'transaction_count', label: 'Transactions', align: 'right' },
                      { key: 'discount_amount', label: 'Discount Total', align: 'right', render: (row) => money(row.discount_amount, currencySymbol) },
                      { key: 'vat_removed', label: 'VAT Removed', align: 'right', render: (row) => money(row.vat_removed, currencySymbol) }
                    ]}
                    rows={(dailyReport.discount_breakdown || []).map((row) => ({
                      ...row,
                      discount_type: displayDiscountType(row.discount_type)
                    }))}
                    emptyMessage="No discounts were recorded for the selected filters."
                  />
                </SectionCard>

                <SectionCard title="Payment & Order Method Breakdown">
                  <div className="grid gap-4 lg:grid-cols-2">
                    <div className="space-y-3">
                      <p className="text-[11px] font-black uppercase tracking-[0.16em] text-slate-500">Payment Breakdown</p>
                      {(dailyReport.payment_breakdown || []).length > 0 ? (
                        (dailyReport.payment_breakdown || []).map((entry) => (
                          <div key={`daily-payment-${entry.payment_method}`} className="flex items-center justify-between rounded-xl border border-slate-200 px-3 py-3">
                            <div>
                              <p className="text-sm font-black text-slate-950">{entry.payment_method}</p>
                              <p className="mt-1 text-xs font-medium text-slate-500">{entry.total_transactions || 0} transactions</p>
                            </div>
                            <div className="text-right">
                              <p className="text-sm font-black text-slate-950">{money(entry.net_sales, currencySymbol)}</p>
                              <p className={`mt-1 text-xs font-black ${Number(entry.pos_profit_loss || 0) >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>
                                {money(entry.pos_profit_loss, currencySymbol)}
                              </p>
                            </div>
                          </div>
                        ))
                      ) : (
                        <EmptyState message="No payment breakdown found for this day." />
                      )}
                    </div>

                    <div className="space-y-3">
                      <p className="text-[11px] font-black uppercase tracking-[0.16em] text-slate-500">Order Method Breakdown</p>
                      {orderMethodRows.length > 0 ? (
                        orderMethodRows.map((entry) => (
                          <div key={`daily-order-method-${entry.order_method}`} className="flex items-center justify-between rounded-xl border border-slate-200 px-3 py-3">
                            <div>
                              <p className="text-sm font-black text-slate-950">{formatOrderMethod(entry.order_method)}</p>
                              <p className="mt-1 text-xs font-medium text-slate-500">{entry.total_transactions || 0} transactions</p>
                            </div>
                            <div className="text-right">
                              <p className="text-sm font-black text-slate-950">{money(entry.net_sales, currencySymbol)}</p>
                              <p className={`mt-1 text-xs font-black ${Number(entry.pos_profit_loss || 0) >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>
                                {money(entry.pos_profit_loss, currencySymbol)}
                              </p>
                            </div>
                          </div>
                        ))
                      ) : (
                        <EmptyState message="No order method breakdown found for this day." />
                      )}
                    </div>
                  </div>
                </SectionCard>

                <SectionCard title="Cashier / Shift Summary">
                  <div className="grid gap-4 lg:grid-cols-2">
                    <div className="space-y-3">
                      <p className="text-[11px] font-black uppercase tracking-[0.16em] text-slate-500">Cashiers</p>
                      {(dailyReport.cashier_summary || []).slice(0, 5).map((entry) => (
                        <div key={`cashier-${entry.cashier_id || entry.cashier_name}`} className="rounded-xl border border-slate-200 px-3 py-3">
                          <div className="flex items-center justify-between gap-2">
                            <p className="text-sm font-black text-slate-950">{entry.cashier_name}</p>
                            <span className={`rounded-full border px-2.5 py-1 text-xs font-black ${deltaTone(entry.summary?.pos_profit_loss)}`}>
                              {money(entry.summary?.pos_profit_loss, currencySymbol)}
                            </span>
                          </div>
                          <p className="mt-2 text-xs font-medium text-slate-500">{entry.summary?.total_transactions || 0} transactions attributed to this cashier</p>
                          <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                            <p className="font-semibold text-slate-500">Gross sales<br /><span className="font-black text-slate-950">{money(entry.summary?.gross_sales, currencySymbol)}</span></p>
                            <p className="font-semibold text-slate-500">Net sales<br /><span className="font-black text-slate-950">{money(entry.summary?.net_sales, currencySymbol)}</span></p>
                          </div>
                          <p className="mt-3 text-[11px] font-semibold text-slate-500">Drawer variance is shown under Registers, never assigned to an uncounted relief cashier.</p>
                        </div>
                      ))}
                    </div>
                    <div className="space-y-3">
                      <p className="text-[11px] font-black uppercase tracking-[0.16em] text-slate-500">Shifts</p>
                      {(cashierLifecycle.registers || []).slice(0, 5).map((entry) => (
                        <div key={`shift-${(entry.shift_ids || []).join('-') || entry.opening_cashier_id}`} className="rounded-xl border border-slate-200 px-3 py-3">
                          <div className="flex items-center justify-between gap-2">
                            <p className="text-sm font-black text-slate-950">Register {(entry.shift_ids || []).join(', ') || '-'}</p>
                            <span className={`rounded-full border px-2.5 py-1 text-xs font-black ${deltaTone(entry.variance_amount)}`}>
                              {money(entry.variance_amount, currencySymbol)}
                            </span>
                          </div>
                          <p className="mt-2 text-xs font-medium text-slate-500">
                            Opened by {entry.opening_cashier_name || 'Legacy cashier'} • {entry.closed_shift_count || 0} closed
                          </p>
                          <p className="mt-2 text-xs font-semibold text-slate-500">
                            Expected: <span className="font-black text-slate-950">{money(entry.expected_cash_amount, currencySymbol)}</span> • Counted: <span className="font-black text-slate-950">{entry.closing_cash_amount == null ? 'Open shift' : money(entry.closing_cash_amount, currencySymbol)}</span>
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                </SectionCard>

                <SectionCard title="Filtered Transactions">
                  <DataTable
                    columns={[
                      { key: 'invoice_number', label: 'Invoice' },
                      { key: 'created_at', label: 'Datetime', render: (row) => printDateTime(row.created_at) },
                      { key: 'cashier_name', label: 'Cashier' },
                      { key: 'payment_type', label: 'Payment', render: (row) => formatPosTransactionPaymentMethods(row) },
                      { key: 'status', label: 'Status' },
                      { key: 'total_amount', label: 'Total', align: 'right', render: (row) => money(row.total_amount, currencySymbol) },
                      { key: 'net_sales', label: 'Reported Net Sales', align: 'right', render: (row) => money(row.net_sales, currencySymbol) }
                    ]}
                    rows={transactionRows}
                    emptyMessage="No transactions found for the selected filters."
                  />
                </SectionCard>
              </div>
            </div>
          ) : null}

          {activeSection === 'attendance' ? (
            <SectionCard title="Attendance and Breaks">
              <p className="mb-3 text-xs font-semibold text-slate-500">Worked minutes equal elapsed duty minutes minus recorded breaks. This is attendance evidence, not payroll.</p>
              <DataTable
                columns={[
                  { key: 'cashier_name', label: 'Cashier' },
                  { key: 'duty_type', label: 'Duty', render: (row) => String(row.duty_type || '').replace(/_/g, ' ') },
                  { key: 'status', label: 'Status' },
                  { key: 'started_at', label: 'Time In', render: (row) => printDateTime(row.started_at) },
                  { key: 'ended_at', label: 'Time Out', render: (row) => row.ended_at ? printDateTime(row.ended_at) : 'Active' },
                  { key: 'break_minutes', label: 'Break', align: 'right', render: (row) => `${Number(row.break_minutes || 0)} min` },
                  { key: 'worked_minutes', label: 'Worked', align: 'right', render: (row) => `${Number(row.worked_minutes || 0)} min` }
                ]}
                rows={cashierLifecycle.attendance?.rows || []}
                emptyMessage="No attendance sessions were recorded for these filters."
              />
            </SectionCard>
          ) : null}

          {activeSection === 'cashiers' ? (
            <div className="space-y-4">
              <SectionCard title="Cashier Sales Reconciliation">
                <div className="grid gap-3 sm:grid-cols-3">
                  <MetricCard label="Cashier Net Sales" value={money(cashierLifecycle.reconciliation?.cashier_net_sales, currencySymbol)} />
                  <MetricCard label="Register Transaction Net" value={money(cashierLifecycle.reconciliation?.register_transaction_net_sales, currencySymbol)} />
                  <MetricCard label="Difference" value={money(cashierLifecycle.reconciliation?.difference, currencySymbol)} tone={cashierLifecycle.reconciliation?.reconciled ? 'positive' : 'negative'} />
                </div>
              </SectionCard>
              <SectionCard title="Sales by Actual Cashier">
                <DataTable
                  columns={[
                    { key: 'cashier_name', label: 'Cashier' },
                    { key: 'transactions', label: 'Transactions', align: 'right', render: (row) => row.summary?.total_transactions || 0 },
                    { key: 'gross_sales', label: 'Gross Sales', align: 'right', render: (row) => money(row.summary?.gross_sales, currencySymbol) },
                    { key: 'net_sales', label: 'Net Sales', align: 'right', render: (row) => money(row.summary?.net_sales, currencySymbol) },
                    { key: 'notice', label: 'Attribution', render: () => 'Authenticated operator; legacy rows are disclosed in transaction detail' }
                  ]}
                  rows={dailyReport.cashier_summary || []}
                  emptyMessage="No cashier sales were recorded for these filters."
                />
              </SectionCard>
            </div>
          ) : null}

          {activeSection === 'registers' ? (
            <SectionCard title="Register and Drawer Reconciliation">
              <p className="mb-3 text-xs font-semibold text-slate-500">These totals belong to the continuous register/drawer lifecycle. They are not individual relief-cashier variance.</p>
              <DataTable
                columns={[
                  { key: 'shift_ids', label: 'Register Shifts', render: (row) => (row.shift_ids || []).join(', ') || '-' },
                  { key: 'opening_cashier_name', label: 'Opening Cashier' },
                  { key: 'opening_float_amount', label: 'Opening Float', align: 'right', render: (row) => money(row.opening_float_amount, currencySymbol) },
                  { key: 'cash_sales_amount', label: 'Cash Sales', align: 'right', render: (row) => money(row.cash_sales_amount, currencySymbol) },
                  { key: 'expected_cash_amount', label: 'Expected', align: 'right', render: (row) => money(row.expected_cash_amount, currencySymbol) },
                  { key: 'closing_cash_amount', label: 'Counted', align: 'right', render: (row) => row.closing_cash_amount == null ? 'Open' : money(row.closing_cash_amount, currencySymbol) },
                  { key: 'variance_amount', label: 'Variance', align: 'right', render: (row) => row.variance_amount == null ? '-' : money(row.variance_amount, currencySymbol) }
                ]}
                rows={cashierLifecycle.registers || []}
                emptyMessage="No register shifts were recorded for these filters."
              />
            </SectionCard>
          ) : null}

          {activeSection === 'handoffs' ? (
            <div className="space-y-4">
              <SectionCard title="Operator Sessions">
                <DataTable
                  columns={[
                    { key: 'cashier_name', label: 'Operator' },
                    { key: 'terminal_id', label: 'Terminal' },
                    { key: 'shift_id', label: 'Register Shift' },
                    { key: 'started_at', label: 'Started', render: (row) => printDateTime(row.started_at) },
                    { key: 'ended_at', label: 'Ended', render: (row) => row.ended_at ? printDateTime(row.ended_at) : 'Active' },
                    { key: 'ended_reason', label: 'End Reason', render: (row) => row.ended_reason || '-' }
                  ]}
                  rows={cashierLifecycle.operators?.rows || []}
                  emptyMessage="No operator sessions were recorded for these filters."
                />
              </SectionCard>
              <SectionCard title="Drawer Handoff Timeline">
                <DataTable
                  columns={[
                    { key: 'event_at', label: 'Event Time', render: (row) => printDateTime(row.event_at) },
                    { key: 'event_type', label: 'Event', render: (row) => String(row.event_type || '').replace(/_/g, ' ') },
                    { key: 'outgoing_operator_name', label: 'Outgoing', render: (row) => row.outgoing_operator_name || '-' },
                    { key: 'incoming_operator_name', label: 'Incoming', render: (row) => row.incoming_operator_name || '-' },
                    { key: 'custody_mode', label: 'Custody', render: (row) => String(row.custody_mode || '').replace(/_/g, ' ') },
                    { key: 'counted_cash_amount', label: 'Counted', align: 'right', render: (row) => row.counted_cash_amount == null ? 'Not counted' : money(row.counted_cash_amount, currencySymbol) },
                    { key: 'variance_amount', label: 'Variance', align: 'right', render: (row) => row.variance_amount == null ? 'Not attributed' : money(row.variance_amount, currencySymbol) }
                  ]}
                  rows={cashierLifecycle.handoffs?.rows || []}
                  emptyMessage="No shared-access or counted handoffs were recorded for these filters."
                />
              </SectionCard>
            </div>
          ) : null}

          {activeSection === 'comparison' ? (
            <SectionCard title="Sales Comparison Snapshot">
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                {comparisonCards.map((entry) => {
                  const positive = Number(entry.sales_delta_percentage || 0) >= 0;
                  const DeltaIcon = positive ? ArrowUpRight : ArrowDownRight;
                  return (
                    <div key={entry.key} className={`rounded-2xl border px-4 py-4 ${positive ? 'border-emerald-200 bg-emerald-50/80' : 'border-rose-200 bg-rose-50/80'}`}>
                      <p className="text-sm font-black text-slate-950">{entry.label}</p>
                      <p className="mt-3 text-2xl font-black text-slate-950">{money(entry.current?.net_sales, currencySymbol)}</p>
                      <div className={`mt-3 inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-black ${deltaTone(entry.sales_delta_percentage)}`}>
                        <DeltaIcon className="h-3.5 w-3.5" />
                        {percent(entry.sales_delta_percentage)}
                      </div>
                    </div>
                  );
                })}
              </div>
            </SectionCard>
          ) : null}

          {activeSection === 'profit_loss' ? (
            <SectionCard title="POS Profit/Loss">
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
                <MetricCard label="Gross Sales" value={money(profitLoss.gross_sales, currencySymbol)} />
                <MetricCard label="Net Sales" value={money(profitLoss.net_sales, currencySymbol)} />
                <MetricCard label="COGS" value={money(profitLoss.cogs, currencySymbol)} />
                <MetricCard label="POS Profit/Loss" value={money(profitLoss.pos_profit_loss, currencySymbol)} tone={Number(profitLoss.pos_profit_loss || 0) >= 0 ? 'positive' : 'negative'} />
                <MetricCard label="Profit Margin" value={percent(profitLoss.profit_margin)} tone={Number(profitLoss.pos_profit_loss || 0) >= 0 ? 'positive' : 'negative'} />
              </div>
            </SectionCard>
          ) : null}

          {activeSection === 'yearly' ? (
            <SectionCard title="Year-over-Year">
              <div className="grid gap-3 md:grid-cols-2">
                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
                  <p className="text-[11px] font-black uppercase tracking-[0.16em] text-slate-500">Current year</p>
                  <p className="mt-2 text-2xl font-black text-slate-950">{money(yearlyReport.year_over_year?.current?.net_sales, currencySymbol)}</p>
                  <p className="mt-2 text-sm font-semibold text-slate-600">Profit {money(yearlyReport.year_over_year?.current?.pos_profit_loss, currencySymbol)}</p>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
                  <p className="text-[11px] font-black uppercase tracking-[0.16em] text-slate-500">Previous year</p>
                  <p className="mt-2 text-2xl font-black text-slate-950">{money(yearlyReport.year_over_year?.previous?.net_sales, currencySymbol)}</p>
                  <p className="mt-2 text-sm font-semibold text-slate-600">Profit {money(yearlyReport.year_over_year?.previous?.pos_profit_loss, currencySymbol)}</p>
                </div>
              </div>
            </SectionCard>
          ) : null}

          {!isLifecycleSection ? <SectionCard title={activeSection === 'daily' ? 'Top-Selling Items' : activeSection === 'monthly' ? 'Best-Selling Items' : activeSection === 'yearly' ? 'Yearly Best Sellers' : 'Top Items'}>
            <DataTable
              columns={[
                { key: 'item_name', label: 'Item' },
                { key: 'sku_code', label: 'SKU' },
                { key: 'category', label: 'Category' },
                { key: 'quantity', label: 'Qty', align: 'right', render: (row) => Number(row.quantity || 0).toFixed(2) },
                { key: 'net_sales', label: 'Net Sales', align: 'right', render: (row) => money(row.net_sales, currencySymbol) },
                { key: 'cogs', label: 'COGS', align: 'right', render: (row) => money(row.cogs, currencySymbol) },
                { key: 'pos_profit_loss', label: 'POS Profit/Loss', align: 'right', render: (row) => (
                  <span className={Number(row.pos_profit_loss || 0) >= 0 ? 'font-black text-emerald-700' : 'font-black text-rose-700'}>
                    {money(row.pos_profit_loss, currencySymbol)}
                  </span>
                ) }
              ]}
              rows={activeSection === 'yearly'
                ? (yearlyReport.top_items || [])
                : activeSection === 'monthly'
                  ? (monthlyReport.top_items || [])
                  : (dailyReport.top_items || [])}
              emptyMessage="No top-item activity found for the selected filters."
            />
          </SectionCard> : null}
          </div>
        </div>
      )}
      <EmployeeCreditReportPanel
        dateFrom={normalizedDateRange.dateFrom}
        dateTo={normalizedDateRange.dateTo}
        currencySymbol={currencySymbol}
        refreshKey={employeeCreditReportRefreshKey}
        isOnline={isOnline}
      />
    </div>
  );
}

export default PosReportsAnalyticsWorkspace;
