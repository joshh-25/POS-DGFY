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
  fetchPosReportsOverview
} from '../services/posService.js';

const REPORT_SECTIONS = [
  { id: 'daily', label: 'Daily Report' },
  { id: 'monthly', label: 'Monthly Report' },
  { id: 'yearly', label: 'Yearly Report' },
  { id: 'comparison', label: 'Sales Comparison' },
  { id: 'profit_loss', label: 'POS Profit/Loss' }
];

const REPORT_SECTION_GRANULARITY = {
  daily: 'daily',
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
  { value: 'bank_transfer', label: 'Bank Transfer' }
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
          if (!reportData) {
            setReportData(null);
          }
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
  const filterOptions = reportData?.filter_options || {};
  const dailyReport = reportData?.daily_report || {};
  const monthlyReport = reportData?.monthly_report || {};
  const yearlyReport = reportData?.yearly_report || {};
  const comparisonReport = reportData?.sales_comparison || {};
  const profitLoss = reportData?.profit_loss || {};

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
    || (trendSeries || []).length > 0
  );

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

  const handlePrint = () => {
    if (typeof window === 'undefined' || !reportData) return;
    const printWindow = window.open('', '_blank', 'width=1120,height=900');
    if (!printWindow) return;

    const topItems = (dailyReport.top_items || []).slice(0, 10).map((item) => `
      <tr>
        <td>${item.item_name}</td>
        <td>${item.sku_code || '-'}</td>
        <td style="text-align:right">${Number(item.quantity || 0).toFixed(2)}</td>
        <td style="text-align:right">${money(item.net_sales, currencySymbol)}</td>
        <td style="text-align:right">${money(item.pos_profit_loss, currencySymbol)}</td>
      </tr>
    `).join('');

    printWindow.document.write(`
      <html>
        <head>
          <title>Reports & Analytics</title>
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
          </style>
        </head>
        <body>
          <h1>Reports & Analytics</h1>
          <p>Daily totals, sales comparison, POS profit/loss, top items, and transaction performance.</p>
          <p>Range: ${dateRange.dateFrom} to ${dateRange.dateTo}</p>
          <div class="grid">
            <div class="card"><div class="label">Total Sales</div><div class="value">${money(summaryCards.total_sales, currencySymbol)}</div></div>
            <div class="card"><div class="label">Transactions</div><div class="value">${Number(summaryCards.total_transactions || 0)}</div></div>
            <div class="card"><div class="label">Gross Sales</div><div class="value">${money(summaryCards.gross_sales, currencySymbol)}</div></div>
            <div class="card"><div class="label">All Discounts</div><div class="value">${money(dailyReport.summary?.discounts, currencySymbol)}</div></div>
            <div class="card"><div class="label">POS Profit/Loss</div><div class="value">${money(summaryCards.pos_profit_loss, currencySymbol)}</div></div>
          </div>
          <h2>Daily Top Items</h2>
          <table>
            <thead>
              <tr>
                <th>Item</th>
                <th>SKU</th>
                <th>Qty</th>
                <th>Net Sales</th>
                <th>POS Profit/Loss</th>
              </tr>
            </thead>
            <tbody>${topItems || '<tr><td colspan="5">No rows found.</td></tr>'}</tbody>
          </table>
        </body>
      </html>
    `);
    printWindow.document.close();
    printWindow.focus();
    printWindow.print();
  };

  const comparisonCards = comparisonReport.fixed_periods || [];
  const cashiers = Array.isArray(filterOptions.cashiers) ? filterOptions.cashiers : [];
  const categories = (Array.isArray(filterOptions.categories) ? filterOptions.categories : []).map((entry) => (
    typeof entry === 'string'
      ? { folder_id: null, name: entry, legacy: true }
      : entry
  ));

  return (
    <div id={sectionId} className="space-y-4">
      <div className="flex flex-col gap-4">
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
      <section className="order-2 md:order-1 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm shadow-slate-200/70">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-[1.2fr_1.2fr_1fr_1fr_auto_auto]">
          <div className="grid grid-cols-2 gap-3 sm:contents">
            <label className="space-y-1.5">
              <span className="text-[11px] font-black uppercase tracking-[0.16em] text-slate-500">Date from</span>
              <div className="relative">
                <Input type="date" value={dateRange.dateFrom} onChange={(event) => setDateRange((prev) => ({ ...prev, dateFrom: event.target.value }))} className="pos-report-date-input h-11 rounded-xl pr-9 md:pr-3" />
                <Calendar className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400 md:hidden" />
              </div>
            </label>
            <label className="space-y-1.5">
              <span className="text-[11px] font-black uppercase tracking-[0.16em] text-slate-500">Date to</span>
              <div className="relative">
                <Input type="date" value={dateRange.dateTo} min={dateRange.dateFrom} onChange={(event) => setDateRange((prev) => ({ ...prev, dateTo: event.target.value }))} className="pos-report-date-input h-11 rounded-xl pr-9 md:pr-3" />
                <Calendar className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400 md:hidden" />
              </div>
            </label>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:contents">
            <label className="space-y-1.5">
              <span className="text-[11px] font-black uppercase tracking-[0.16em] text-slate-500">Range</span>
              <select className="h-11 w-full rounded-xl border border-slate-200 px-3 text-sm font-semibold text-slate-900" value={granularity} onChange={(event) => setGranularity(event.target.value)}>
                {GRANULARITY_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
            </label>
            <label className="space-y-1.5">
              <span className="text-[11px] font-black uppercase tracking-[0.16em] text-slate-500">Cashier</span>
              <select className="h-11 w-full rounded-xl border border-slate-200 px-3 text-sm font-semibold text-slate-900" value={cashierId} onChange={(event) => setCashierId(event.target.value)}>
                <option value="">All cashiers</option>
                {cashiers.map((cashier) => <option key={cashier.cashier_id} value={cashier.cashier_id}>{cashier.cashier_name}</option>)}
              </select>
            </label>
          </div>
          <Button type="button" variant="outline" className="h-11 rounded-xl border-slate-200 px-4 font-extrabold" onClick={handleExportCsv} disabled={!reportData}>
            <Download className="mr-2 h-4 w-4" />
            Export CSV
          </Button>
          <Button type="button" className="h-11 rounded-xl bg-[#2563EB] px-4 font-extrabold text-white hover:bg-[#1D4ED8]" onClick={handlePrint} disabled={!reportData}>
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

      <div className="order-1 grid gap-3 md:order-2 md:grid-cols-2 xl:grid-cols-5">
        <MetricCard label="Total Sales" value={money(summaryCards.total_sales, currencySymbol)} />
        <MetricCard label="Transactions" value={Number(summaryCards.total_transactions || 0)} />
        <MetricCard label="Gross Sales" value={money(summaryCards.gross_sales, currencySymbol)} />
        <MetricCard label="All Discounts" value={money(dailyReport.summary?.discounts, currencySymbol)} />
        <MetricCard
          label="POS Profit/Loss"
          value={money(summaryCards.pos_profit_loss, currencySymbol)}
          tone={Number(summaryCards.pos_profit_loss || 0) >= 0 ? 'positive' : 'negative'}
        />
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
          <div className="grid gap-4 xl:grid-cols-[1.3fr_0.9fr]">
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
          </div>

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
                    rows={dailyReport.discount_breakdown || []}
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
                          <p className="mt-2 text-xs font-medium text-slate-500">{entry.shift_ids?.length || 0} shifts, {entry.summary?.total_transactions || 0} transactions</p>
                          <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                            <p className="font-semibold text-slate-500">Expected cash<br /><span className="font-black text-slate-950">{money(entry.shift_money?.expected_cash_amount, currencySymbol)}</span></p>
                            <p className="font-semibold text-slate-500">Cash after shift<br /><span className="font-black text-slate-950">{money(entry.shift_money?.closing_cash_amount, currencySymbol)}</span></p>
                            <p className="font-semibold text-slate-500">Variance<br /><span className={Number(entry.shift_money?.cash_variance_amount || 0) === 0 ? 'font-black text-slate-950' : 'font-black text-rose-700'}>{money(entry.shift_money?.cash_variance_amount, currencySymbol)}</span></p>
                            <p className="font-semibold text-slate-500">Closed shifts<br /><span className="font-black text-slate-950">{entry.shift_money?.closed_shift_count || 0}</span></p>
                          </div>
                        </div>
                      ))}
                    </div>
                    <div className="space-y-3">
                      <p className="text-[11px] font-black uppercase tracking-[0.16em] text-slate-500">Shifts</p>
                      {(dailyReport.shift_summary || []).slice(0, 5).map((entry) => (
                        <div key={`shift-${entry.shift_id || entry.terminal_id || entry.business_date}`} className="rounded-xl border border-slate-200 px-3 py-3">
                          <div className="flex items-center justify-between gap-2">
                            <p className="text-sm font-black text-slate-950">{entry.terminal_id || 'Terminal'}</p>
                            <span className={`rounded-full border px-2.5 py-1 text-xs font-black ${deltaTone(entry.summary?.pos_profit_loss)}`}>
                              {money(entry.summary?.pos_profit_loss, currencySymbol)}
                            </span>
                          </div>
                          <p className="mt-2 text-xs font-medium text-slate-500">
                            {entry.business_date || 'No business date'} • {entry.summary?.total_transactions || 0} transactions
                          </p>
                          <p className="mt-2 text-xs font-semibold text-slate-500">
                            Closing cash: <span className="font-black text-slate-950">{entry.status === 'closed' ? money(entry.closing_cash_amount, currencySymbol) : 'Open shift'}</span>
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                </SectionCard>
              </div>
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

          <SectionCard title={activeSection === 'daily' ? 'Top-Selling Items' : activeSection === 'monthly' ? 'Best-Selling Items' : activeSection === 'yearly' ? 'Yearly Best Sellers' : 'Top Items'}>
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
          </SectionCard>
          </div>
        </div>
      )}
    </div>
  );
}

export default PosReportsAnalyticsWorkspace;
