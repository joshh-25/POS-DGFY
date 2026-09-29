import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { fetchUnifiedSalesTransactions, exportUnifiedSalesTransactionsCsv } from '@/services/salesService';
import { usePermission } from '@/hooks/usePermission';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useWorkflowMode } from '@/src/features/settings/WorkflowModeContext.jsx';
import { isMsmeWorkflowMode } from '@/src/features/settings/workflowMode.js';
import SalesDateRangePicker from '../components/SalesDateRangePicker.jsx';
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Download,
  Eye,
  Search,
  TrendingUp,
  X
} from 'lucide-react';

const money = (value) => `PHP ${Number(value || 0).toFixed(2)}`;
const formatSalesLabel = (value) => String(value || '—').replace(/_/g, ' ').replace(/\b\w/g, (character) => character.toUpperCase());
const formatSalesDate = (value) => {
  if (!value) return '—';
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime())
    ? '—'
    : parsed.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
};

const statusTone = (status) => {
  const normalized = String(status || '').toLowerCase();
  if (['completed', 'paid', 'delivered'].includes(normalized)) return 'bg-emerald-50 text-emerald-700 ring-emerald-200';
  if (['voided', 'cancelled', 'rejected'].includes(normalized)) return 'bg-rose-50 text-rose-700 ring-rose-200';
  if (['draft', 'pending', 'partial'].includes(normalized)) return 'bg-amber-50 text-amber-700 ring-amber-200';
  return 'bg-slate-100 text-slate-600 ring-slate-200';
};

const sourceTone = (source) => String(source || '').toUpperCase() === 'POS'
  ? 'bg-indigo-50 text-indigo-700 ring-indigo-200'
  : 'bg-emerald-50 text-emerald-700 ring-emerald-200';

const SalesSourceBadges = ({ row }) => (
  <div className="flex flex-wrap items-center gap-1.5">
    <span className={`inline-flex items-center rounded-full px-2 py-1 text-[11px] font-bold uppercase tracking-wide ring-1 ${sourceTone(row.source)}`}>
      {row.source || 'Unknown'}
    </span>
    {row.source === 'POS' && row.pos_order_source && (
      <span className={`inline-flex items-center rounded-full px-2 py-1 text-[11px] font-semibold ring-1 ${row.pos_order_source === 'online_store' ? 'bg-sky-50 text-sky-700 ring-sky-200' : 'bg-slate-100 text-slate-600 ring-slate-200'}`}>
        {row.pos_order_source === 'online_store' ? 'Online Store' : 'In-Store'}
      </span>
    )}
  </div>
);

const summaryMetricTone = {
  neutral: 'border-slate-200 bg-white before:bg-slate-300',
  teal: 'border-teal-200 bg-teal-50/35 before:bg-teal-500',
  indigo: 'border-indigo-200 bg-indigo-50/30 before:bg-indigo-500',
  emerald: 'border-emerald-200 bg-emerald-50/30 before:bg-emerald-500'
};

const SummaryMetric = ({ label, value, detail, tone = 'text-slate-900', accent = 'neutral' }) => (
  <div className={`relative overflow-hidden rounded-2xl border p-4 shadow-sm before:absolute before:inset-y-0 before:left-0 before:w-1 ${summaryMetricTone[accent] || summaryMetricTone.neutral}`}>
    <div className="flex items-start justify-between gap-3">
      <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-slate-500">{label}</p>
      <TrendingUp size={15} className="text-slate-400" aria-hidden="true" />
    </div>
    <p className={`mt-1 text-xl font-black tracking-tight ${tone}`}>{value}</p>
    {detail ? <p className="mt-1 text-xs text-slate-500">{detail}</p> : null}
  </div>
);

const TransactionMetric = ({ label, value, tone = 'text-slate-900', detail }) => (
  <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
    <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-slate-500">{label}</p>
    <p className={`mt-2 truncate text-lg font-black tracking-tight ${tone}`}>{value}</p>
    {detail ? <p className="mt-1 text-xs text-slate-500">{detail}</p> : null}
  </div>
);

const TransactionDetailRow = ({ label, value, valueClassName = '' }) => (
  <div className="min-w-0 rounded-xl bg-slate-50/80 px-3 py-2.5">
    <dt className="text-[11px] font-bold uppercase tracking-[0.08em] text-slate-400">{label}</dt>
    <dd className={`mt-1 truncate text-sm font-semibold text-slate-800 ${valueClassName}`}>{value ?? '—'}</dd>
  </div>
);

const TransactionDetailSection = ({ title, description, children }) => (
  <details className="group rounded-2xl border border-slate-200 bg-white">
    <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-4 py-3.5 [&::-webkit-details-marker]:hidden">
      <span className="min-w-0">
        <span className="block text-sm font-black text-slate-900">{title}</span>
        <span className="mt-0.5 block text-xs text-slate-500">{description}</span>
      </span>
      <ChevronDown size={17} className="shrink-0 text-slate-400 transition-transform group-open:rotate-180" aria-hidden="true" />
    </summary>
    <div className="border-t border-slate-100 px-4 py-4">
      <dl className="grid gap-2 sm:grid-cols-2">{children}</dl>
    </div>
  </details>
);

const FilterField = ({ label, children, className = '' }) => (
  <label className={`flex min-w-0 flex-col gap-1.5 ${className}`}>
    <span className="text-[11px] font-bold uppercase tracking-[0.1em] text-slate-500">{label}</span>
    {children}
  </label>
);

const TransactionCard = ({ row, selected, onSelect }) => {
  const isSelected = selected?.source_id === row.source_id && selected?.source === row.source;
  const reference = row.reference_no || `#${row.source_id || '—'}`;
  return (
    <article className={`rounded-2xl border p-4 shadow-sm transition-colors ${isSelected ? 'border-teal-400 bg-teal-50/60' : 'border-slate-200 bg-white'}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <SalesSourceBadges row={row} />
          <p className="mt-2 truncate text-sm font-black text-slate-900">{reference}</p>
          <p className="mt-1 text-xs text-slate-500">{formatSalesDate(row.occurred_at)}</p>
        </div>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-3 border-t border-slate-100 pt-3 sm:grid-cols-4">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">VAT</p>
          <p className="mt-1 text-sm font-semibold text-slate-700">{money(row.vat_amount)}</p>
        </div>
        <div>
          <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Gross</p>
          <p className="mt-1 text-sm font-bold text-slate-900">{money(row.gross_sales)}</p>
        </div>
        <div>
          <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">COGS</p>
          <p className="mt-1 text-sm font-semibold text-slate-700">{money(row.cogs)}</p>
        </div>
        <div>
          <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Profit</p>
          <p className="mt-1 text-sm font-bold text-emerald-700">{money(row.gross_profit)}</p>
        </div>
      </div>
      <div className="mt-4 flex items-center justify-end gap-3">
        <Button type="button" size="sm" variant="outline" onClick={() => onSelect(row)} aria-label={`View transaction ${reference}`}>
          <Eye size={14} /> View
        </Button>
      </div>
    </article>
  );
};

export default function SalesPage({ embedded = false, adminRootPath = '/' }) {
  const location = useLocation();
  const navigate = useNavigate();
  const { loading: permissionLoading, can } = usePermission();
  const { workflowMode } = useWorkflowMode();
  const isMsmeMode = isMsmeWorkflowMode(workflowMode);
  const canView = can('reports:view') || can('do:view') || can('pos:view') || can('pos:transact');
  const hydratedFromQueryRef = useRef(false);
  const msmeDefaultsAppliedRef = useRef(false);
  const [search, setSearch] = useState('');
  const [itemId, setItemId] = useState('');
  const [source, setSource] = useState('ALL');
  const [sourceId, setSourceId] = useState('');
  const [status, setStatus] = useState('all');
  const [paymentType, setPaymentType] = useState('all');
  const [orderMethod, setOrderMethod] = useState('all');
  const [posOrderSource, setPosOrderSource] = useState('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [sortBy, setSortBy] = useState('occurred_at');
  const [sortOrder, setSortOrder] = useState('desc');
  const [rows, setRows] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, totalPages: 1 });
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [selected, setSelected] = useState(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [sourceContext, setSourceContext] = useState('');
  const [showExportPrecheck, setShowExportPrecheck] = useState(false);
  const [lastExportMeta, setLastExportMeta] = useState(null);

  useEffect(() => {
    if (hydratedFromQueryRef.current) return;
    const params = new URLSearchParams(location.search);
    const sourceParam = String(params.get('source') || '').toUpperCase();
    if (['ALL', 'POS', 'DISPATCH'].includes(sourceParam)) {
      setSource(sourceParam);
    }
    setSearch(params.get('search') || '');
    setItemId(params.get('item_id') || '');
    setStatus(params.get('status') || 'all');
    setPaymentType(params.get('payment_type') || 'all');
    setOrderMethod(params.get('order_method') || 'all');
    setPosOrderSource(params.get('pos_order_source') || 'all');
    setDateFrom(params.get('date_from') || '');
    setDateTo(params.get('date_to') || '');
    setSourceId(params.get('source_id') || '');
    setSourceContext(params.get('source_context') || '');
    const sortByParam = params.get('sort_by') || 'occurred_at';
    const sortOrderParam = params.get('sort_order') || 'desc';
    setSortBy(sortByParam);
    setSortOrder(sortOrderParam === 'asc' ? 'asc' : 'desc');
    hydratedFromQueryRef.current = true;
  }, [location.search]);

  useEffect(() => {
    if (!hydratedFromQueryRef.current) return;
    const params = new URLSearchParams();
    if (search) params.set('search', search);
    if (itemId) params.set('item_id', itemId);
    if (source && source !== 'ALL') params.set('source', source);
    if (sourceId) params.set('source_id', sourceId);
    if (status !== 'all') params.set('status', status);
    if (paymentType !== 'all') params.set('payment_type', paymentType);
    if (orderMethod !== 'all') params.set('order_method', orderMethod);
    if (posOrderSource !== 'all') params.set('pos_order_source', posOrderSource);
    if (dateFrom) params.set('date_from', dateFrom);
    if (dateTo) params.set('date_to', dateTo);
    if (sortBy && sortBy !== 'occurred_at') params.set('sort_by', sortBy);
    if (sortOrder && sortOrder !== 'desc') params.set('sort_order', sortOrder);
    if (sourceContext) params.set('source_context', sourceContext);
    const nextSearch = params.toString();
    const current = location.search.startsWith('?') ? location.search.slice(1) : location.search;
    if (nextSearch !== current) {
      navigate(`${location.pathname}${nextSearch ? `?${nextSearch}` : ''}`, { replace: true });
    }
  }, [
    dateFrom,
    dateTo,
    location.pathname,
    location.search,
    itemId,
    navigate,
    orderMethod,
    paymentType,
    search,
    sortBy,
    sortOrder,
    source,
    sourceContext,
    sourceId,
    status,
    posOrderSource
  ]);

  const loadSales = useCallback(async (page = 1) => {
    setLoading(true);
    try {
      const result = await fetchUnifiedSalesTransactions({
        page,
        limit: 20,
        search: search || undefined,
        item_id: itemId || undefined,
        source: source === 'ALL' ? undefined : source,
        source_id: sourceId || undefined,
        status: status === 'all' ? undefined : status,
        payment_type: paymentType === 'all' ? undefined : paymentType,
        order_method: orderMethod === 'all' ? undefined : orderMethod,
        pos_order_source: posOrderSource === 'all' ? undefined : posOrderSource,
        date_from: dateFrom || undefined,
        date_to: dateTo || undefined,
        sort_by: sortBy,
        sort_order: sortOrder
      });
      setRows(result.transactions || []);
      setPagination(result.pagination || { page: 1, totalPages: 1 });
      setSummary(result.summary || null);
      if (result.transactions?.length) {
        const sourceIdNumeric = Number.parseInt(sourceId, 10);
        const sourceIdMatch = Number.isInteger(sourceIdNumeric)
          ? result.transactions.find((row) => Number(row?.source_id) === sourceIdNumeric)
          : null;
        setSelected((prev) => {
          if (sourceIdMatch) return sourceIdMatch;
          if (!prev) return null;
          return result.transactions.some((row) => row.source === prev.source && row.source_id === prev.source_id)
            ? prev
            : null;
        });
      }
    } catch (error) {
      toast.error(error?.response?.data?.message || 'Failed to load unified sales');
    } finally {
      setLoading(false);
    }
  }, [dateFrom, dateTo, itemId, orderMethod, paymentType, search, sortBy, sortOrder, source, sourceId, status, posOrderSource]);

  useEffect(() => {
    const timer = setTimeout(() => loadSales(1), 250);
    return () => clearTimeout(timer);
  }, [loadSales]);

  useEffect(() => {
    if (!hydratedFromQueryRef.current) return;
    if (!isMsmeMode) {
      msmeDefaultsAppliedRef.current = false;
      return;
    }
    if (msmeDefaultsAppliedRef.current) return;

    const today = new Date().toISOString().slice(0, 10);
    setSource('POS');
    setStatus('completed');
    setPaymentType('cash');
    setDateFrom((prev) => prev || today);
    setDateTo((prev) => prev || today);
    msmeDefaultsAppliedRef.current = true;
  }, [isMsmeMode]);

  const activeFilterSummary = useMemo(() => {
    const parts = [];
    parts.push(`source=${source}`);
    if (itemId) parts.push(`item_id=${itemId}`);
    if (sourceId) parts.push(`source_id=${sourceId}`);
    if (status !== 'all') parts.push(`status=${status}`);
    if (paymentType !== 'all') parts.push(`payment=${paymentType}`);
    if (orderMethod !== 'all') parts.push(`order_method=${orderMethod}`);
    if (posOrderSource !== 'all') parts.push(`pos_order_source=${posOrderSource}`);
    if (dateFrom) parts.push(`date_from=${dateFrom}`);
    if (dateTo) parts.push(`date_to=${dateTo}`);
    if (search) parts.push(`search="${search}"`);
    return parts.join(', ');
  }, [dateFrom, dateTo, itemId, orderMethod, paymentType, search, source, sourceId, status, posOrderSource]);

  const msmeDailySnapshot = useMemo(() => {
    if (!isMsmeMode) return null;
    const grossSales = Number(summary?.gross_sales || 0);
    const transactionCount = Number(pagination?.total || rows.length || 0);
    const averageTicket = transactionCount > 0 ? grossSales / transactionCount : 0;
    return {
      grossSales,
      transactionCount,
      averageTicket
    };
  }, [isMsmeMode, pagination?.total, rows.length, summary?.gross_sales]);

  const resultCount = Number(pagination?.total ?? rows.length ?? 0);

  const handleSelectTransaction = (row) => {
    setSelected(row);
    setDetailOpen(true);
  };

  const runExportCsv = async () => {
    setExporting(true);
    try {
      const exportDate = new Date().toISOString().slice(0, 10);
      const filename = `sales_timeline_${exportDate}.csv`;
      const blob = await exportUnifiedSalesTransactionsCsv({
        search: search || undefined,
        item_id: itemId || undefined,
        source: source === 'ALL' ? undefined : source,
        source_id: sourceId || undefined,
        status: status === 'all' ? undefined : status,
        payment_type: paymentType === 'all' ? undefined : paymentType,
        order_method: orderMethod === 'all' ? undefined : orderMethod,
        pos_order_source: posOrderSource === 'all' ? undefined : posOrderSource,
        date_from: dateFrom || undefined,
        date_to: dateTo || undefined,
        sort_by: sortBy,
        sort_order: sortOrder
      });
      const url = window.URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = filename;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.URL.revokeObjectURL(url);
      setLastExportMeta({
        filename,
        filterSummary: activeFilterSummary,
        rowCount: pagination?.total || rows.length
      });
      toast.success(`Sales CSV exported: ${filename}`);
    } catch (error) {
      toast.error(error?.response?.data?.message || 'Failed to export unified sales');
    } finally {
      setExporting(false);
    }
  };

  const handleExportCsv = () => {
    setShowExportPrecheck(true);
  };

  if (permissionLoading) {
    return <p className="text-sm text-slate-500">Loading permissions...</p>;
  }

  if (!canView) {
    return <Navigate to="/" replace />;
  }

  return (
    <div className="space-y-4">
      {!embedded && (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-teal-700">Unified sales</p>
            <h1 className="mt-1 text-2xl font-black tracking-tight text-slate-900">Sales Timeline</h1>
            <p className="mt-1 text-sm text-slate-500">See what sold, how much, and where.</p>
          </div>
          <span className="inline-flex w-fit items-center rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 shadow-sm">
            Read-only report · {resultCount} transactions
          </span>
        </div>
      )}
      {isMsmeMode && (
        <div className="flex items-start gap-3 rounded-2xl border border-teal-200 bg-teal-50 px-4 py-3 text-sm text-teal-900 shadow-sm">
          <TrendingUp size={17} className="mt-0.5 shrink-0 text-teal-700" aria-hidden="true" />
          <div>
            <p className="font-bold">MSME Daily Snapshot</p>
            <p className="mt-0.5 text-xs text-teal-800">Today&apos;s cash POS sales are shown by default.</p>
          </div>
        </div>
      )}
      {sourceContext === 'pos_history' && (
        <div className="flex items-start gap-3 rounded-2xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-900 shadow-sm">
          <Eye size={17} className="mt-0.5 shrink-0 text-sky-700" aria-hidden="true" />
          <div>
            <p className="font-bold">Opened from POS history</p>
            <p className="mt-0.5 text-xs text-sky-800">Your source and date filters were preserved for this reporting view.</p>
          </div>
        </div>
      )}
      {lastExportMeta && (
        <div aria-live="polite" className="flex items-start gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900 shadow-sm">
          <Download size={17} className="mt-0.5 shrink-0 text-emerald-700" aria-hidden="true" />
          <div>
            <p className="font-bold">Export complete:</p>
            <p className="mt-0.5 text-xs text-emerald-800"><span className="font-semibold">{lastExportMeta.filename}</span> · {lastExportMeta.rowCount} row(s) · {lastExportMeta.filterSummary || 'no filters'}.</p>
          </div>
        </div>
      )}
      {isMsmeMode && msmeDailySnapshot && (
        <div className="grid gap-3 md:grid-cols-3">
          <SummaryMetric label="Daily gross sales" value={money(msmeDailySnapshot.grossSales)} detail="Today&apos;s completed POS sales" />
          <SummaryMetric label="Transactions" value={msmeDailySnapshot.transactionCount} detail="Matching the current view" />
          <SummaryMetric label="Average ticket" value={money(msmeDailySnapshot.averageTicket)} detail="Gross sales divided by transactions" />
        </div>
      )}

      <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 bg-gradient-to-br from-white to-slate-50/70 p-4 sm:p-5">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
            <div className="flex min-w-0 items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-teal-50 text-teal-700 ring-1 ring-teal-100">
                <TrendingUp size={19} aria-hidden="true" />
              </div>
              <div className="min-w-0">
                <h2 className="mt-1 text-xl font-black tracking-tight text-slate-900">Sales overview</h2>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2 xl:justify-end">
              <select
                aria-label="Sales source"
                value={isMsmeMode ? 'POS' : source}
                onChange={(event) => setSource(event.target.value)}
                disabled={isMsmeMode}
                className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 outline-none transition focus:border-teal-500 focus:ring-2 focus:ring-teal-100 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500"
              >
                <option value="ALL">All sources</option>
                <option value="POS">POS</option>
                <option value="DISPATCH">Dispatch</option>
              </select>
              <Button type="button" onClick={handleExportCsv} disabled={exporting}>
                <Download size={14} /> {exporting ? 'Exporting...' : 'Export CSV'}
              </Button>
            </div>
          </div>

          <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50/65 p-3">
            <div className="grid min-w-0 gap-3 sm:grid-cols-3">
              <FilterField label="Status" className="min-w-0">
                <select aria-label="Filter by status" value={status} onChange={(event) => setStatus(event.target.value)} className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none transition focus:border-teal-500 focus:ring-2 focus:ring-teal-100">
                  <option value="all">All statuses</option>
                  <option value="completed">Completed</option>
                  <option value="voided">Voided</option>
                  <option value="draft">Draft</option>
                  <option value="confirmed">Confirmed</option>
                  <option value="partial">Partial</option>
                  <option value="dispatched">Dispatched</option>
                  <option value="cancelled">Cancelled</option>
                </select>
              </FilterField>
              <FilterField label="Date range" className="min-w-0 sm:col-span-2">
                <SalesDateRangePicker
                  dateFrom={dateFrom}
                  dateTo={dateTo}
                  onApply={({ dateFrom: nextDateFrom, dateTo: nextDateTo }) => {
                    setDateFrom(nextDateFrom);
                    setDateTo(nextDateTo);
                  }}
                />
              </FilterField>
            </div>

            <div className="mt-3 flex flex-col gap-2 border-t border-slate-200/80 pt-3 sm:flex-row sm:items-center">
              <div className="relative min-w-0 flex-1">
                <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" aria-hidden="true" />
                <Input aria-label="Search sales" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search invoice, delivery order, or customer" className="h-10 w-full rounded-xl pl-9" />
              </div>
            </div>
          </div>
        </div>

        <div className="p-4 sm:p-5">

        {summary && (
          <div className="mb-5">
            <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
              <div>
                <h3 className="text-sm font-black text-slate-900">At a glance</h3>
                <p className="mt-0.5 text-xs text-slate-500">Financial totals for the current view.</p>
              </div>
              <span className="text-xs font-semibold text-slate-500">{resultCount} total record(s)</span>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
              <SummaryMetric label="Gross sales" value={money(summary.gross_sales)} detail="Matching the current filters" accent="teal" />
              <SummaryMetric label="Discount" value={money(summary.discounts)} detail="Total discounts applied" />
              <SummaryMetric label="VAT sales" value={money(summary.vatable_sales)} detail="Vatable sales" />
              <SummaryMetric label="VAT" value={money(summary.vat)} detail="VAT collected" />
              <SummaryMetric label="Net sales" value={money(summary.net_sales)} detail="After discounts" tone="text-emerald-700" accent="emerald" />
            </div>
          </div>
        )}

        {loading && (
          <div role="status" aria-live="polite" className="mb-4 flex items-center gap-2 rounded-xl border border-sky-200 bg-sky-50 px-3 py-2 text-sm text-sky-800">
            <span className="h-3 w-3 animate-spin rounded-full border-2 border-sky-300 border-t-sky-700" aria-hidden="true" />
            Updating sales activity…
          </div>
        )}

        <div className="border-t border-slate-200 pt-5">
          <div className="min-w-0">
            <div className="mb-3 flex items-end justify-between gap-3">
              <div>
                <h3 className="text-base font-black text-slate-900">Transactions</h3>
                <p className="mt-0.5 text-xs text-slate-500">Select a record to inspect the full financial snapshot.</p>
              </div>
              {loading && rows.length > 0 ? <span className="text-xs font-semibold text-sky-700">Refreshing…</span> : null}
            </div>

            {loading && rows.length === 0 ? (
              <div role="status" className="flex min-h-[220px] flex-col items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-6 text-center">
                <span className="h-8 w-8 animate-spin rounded-full border-4 border-slate-200 border-t-teal-600" aria-hidden="true" />
                <p className="mt-3 text-sm font-semibold text-slate-700">Loading sales activity</p>
                <p className="mt-1 text-xs text-slate-500">Fetching the latest records for this view.</p>
              </div>
            ) : (
              <>
                <div className="hidden overflow-x-auto rounded-2xl border border-slate-200 md:block" aria-busy={loading}>
                  <table className="w-full min-w-[820px] text-sm" aria-label="Unified sales transactions table">
                    <caption className="sr-only">Unified sales transactions with POS and dispatch sources</caption>
                    <thead className="bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500">
                      <tr className="border-b border-slate-200">
                        <th scope="col" className="px-3 py-3 text-left">Source</th>
                        <th scope="col" className="px-3 py-3 text-left">Reference</th>
                        <th scope="col" className="px-3 py-3 text-left">Date</th>
                        <th scope="col" className="px-3 py-3 text-right">VAT</th>
                        <th scope="col" className="px-3 py-3 text-right">Gross</th>
                        <th scope="col" className="px-3 py-3 text-right">COGS</th>
                        <th scope="col" className="px-3 py-3 text-right">Profit</th>
                        <th scope="col" className="px-3 py-3 text-right">Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((row) => {
                        const isSelected = selected?.source_id === row.source_id && selected?.source === row.source;
                        return (
                          <tr key={`${row.source}-${row.source_id}`} className={`border-b border-slate-100 transition-colors hover:bg-slate-50 ${isSelected ? 'bg-teal-50/70' : 'bg-white'}`}>
                            <td className="px-3 py-3"><SalesSourceBadges row={row} /></td>
                            <td className="px-3 py-3 font-bold text-slate-900">{row.reference_no || `#${row.source_id || '—'}`}</td>
                            <td className="whitespace-nowrap px-3 py-3 text-slate-600">{formatSalesDate(row.occurred_at)}</td>
                            <td className="px-3 py-3 text-right text-slate-600">{money(row.vat_amount)}</td>
                            <td className="px-3 py-3 text-right font-semibold text-slate-800">{money(row.gross_sales)}</td>
                            <td className="px-3 py-3 text-right text-slate-600">{money(row.cogs)}</td>
                            <td className="px-3 py-3 text-right font-bold text-emerald-700">{money(row.gross_profit)}</td>
                            <td className="px-3 py-3 text-right">
                              <Button type="button" size="sm" variant="outline" onClick={() => handleSelectTransaction(row)} aria-label={`View transaction ${row.reference_no || row.source_id}`}>
                                <Eye size={14} /> View
                              </Button>
                            </td>
                          </tr>
                        );
                      })}
                      {!loading && rows.length === 0 && (
                        <tr>
                          <td colSpan={8} className="px-4 py-12 text-center text-slate-500">
                            No sales transactions found for the current filters. Try changing the date, source, or search.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>

                <div className="grid gap-3 md:hidden" aria-label="Sales transaction cards" aria-busy={loading}>
                  {rows.map((row) => <TransactionCard key={`${row.source}-${row.source_id}`} row={row} selected={selected} onSelect={handleSelectTransaction} />)}
                  {!loading && rows.length === 0 && (
                    <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-6 text-center text-sm text-slate-500">
                      No sales transactions found for the current filters.
                    </div>
                  )}
                </div>
              </>
            )}
          </div>

        </div>

        <div className="mt-5 flex flex-col gap-3 border-t border-slate-200 pt-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-slate-500">Page {pagination.page || 1} of {pagination.totalPages || 1} · {resultCount} total record(s)</p>
          <div className="flex gap-2">
            <Button type="button" variant="outline" disabled={loading || (pagination.page || 1) <= 1} onClick={() => loadSales((pagination.page || 1) - 1)}>
              <ChevronLeft size={15} /> Previous
            </Button>
            <Button type="button" variant="outline" disabled={loading || (pagination.page || 1) >= (pagination.totalPages || 1)} onClick={() => loadSales((pagination.page || 1) + 1)}>
              Next <ChevronRight size={15} />
            </Button>
          </div>
        </div>
        </div>
      </section>

      <Dialog open={detailOpen && Boolean(selected)} onOpenChange={setDetailOpen}>
        <DialogContent className="max-h-[calc(100vh-2rem)] overflow-y-auto p-0 sm:max-w-3xl" aria-label="Selected transaction detail">
          {selected ? (
            <>
              <DialogHeader className="relative border-b border-slate-200 px-6 py-5 pr-14">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="inline-flex items-center rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide text-slate-600">
                    Read-only record
                  </span>
                  <SalesSourceBadges row={selected} />
                </div>
                <DialogTitle className="mt-3 text-2xl">Transaction {selected.reference_no || `#${selected.source_id || '—'}`}</DialogTitle>
                <DialogDescription className="mt-1">
                  {formatSalesDate(selected.occurred_at)} · {selected.customer_or_recipient || 'No customer recorded'}
                </DialogDescription>
                <Button type="button" variant="ghost" size="icon" className="absolute right-4 top-4" onClick={() => setDetailOpen(false)} aria-label="Close transaction detail">
                  <X size={17} />
                </Button>
              </DialogHeader>

              <div className="space-y-5 px-6 py-5">
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                  <TransactionMetric label="Gross sales" value={money(selected.gross_sales)} />
                  <TransactionMetric label="Gross profit" value={money(selected.gross_profit)} tone="text-emerald-700" />
                  <TransactionMetric
                    label="Payment status"
                    value={<span className={`inline-flex max-w-full rounded-full px-2 py-1 text-sm ring-1 ${statusTone(selected.payment_status)}`}>{formatSalesLabel(selected.payment_status || '—')}</span>}
                  />
                  <TransactionMetric
                    label="Fulfillment"
                    value={<span className={`inline-flex max-w-full rounded-full px-2 py-1 text-sm ring-1 ${statusTone(selected.fulfillment_status || selected.status)}`}>{formatSalesLabel(selected.fulfillment_status || selected.status || '—')}</span>}
                    />
                  </div>

                {selected.source === 'POS' && selected.source_id ? (
                  <div className="flex flex-col gap-2 rounded-2xl border border-indigo-200 bg-indigo-50/60 p-4 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="text-sm font-black text-indigo-950">Need receipt-safe investigation?</p>
                      <p className="mt-1 text-xs text-indigo-800">Open the canonical Orders detail for payment, refund, item, and audit history.</p>
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      className="shrink-0 border-indigo-200 bg-white text-indigo-800 hover:bg-indigo-100"
                      onClick={() => {
                        setDetailOpen(false);
                        const ordersPath = `${String(adminRootPath || '/').replace(/\/$/, '')}/orders`;
                        navigate(`${ordersPath}?transaction_id=${encodeURIComponent(selected.source_id)}`);
                      }}
                    >
                      Open order detail
                    </Button>
                  </div>
                ) : null}

                <div className="space-y-3">
                  <TransactionDetailSection title="Order overview" description="The essential record and channel information.">
                    <TransactionDetailRow label="Reference" value={selected.reference_no || `#${selected.source_id || '—'}`} />
                    <TransactionDetailRow label="Record status" value={formatSalesLabel(selected.status)} />
                    <TransactionDetailRow label="Customer" value={selected.customer_or_recipient || 'No customer recorded'} />
                    <TransactionDetailRow label="COGS" value={money(selected.cogs)} />
                    {selected.source === 'POS' && (
                      <TransactionDetailRow label="POS channel" value={selected.pos_order_source === 'online_store' ? 'Online Store' : 'In-Store'} />
                    )}
                  </TransactionDetailSection>

                  {selected.source === 'POS' && (
                    <>
                      <TransactionDetailSection title="Tax breakdown" description="Taxable, exempt, and zero-rated sales." >
                        <TransactionDetailRow label="Vatable sales" value={money(selected.vatable_sales)} />
                        <TransactionDetailRow label="VAT" value={money(selected.vat_amount)} />
                        <TransactionDetailRow label="VAT exempt" value={money(selected.vat_exempt_sales)} />
                        <TransactionDetailRow label="Zero rated" value={money(selected.zero_rated_sales)} />
                      </TransactionDetailSection>
                      <TransactionDetailSection title="Fees & discounts" description="Additional charges and applied promotions.">
                        <TransactionDetailRow label="Service fee" value={money(selected.service_fee_amount)} />
                        <TransactionDetailRow label="Delivery fee" value={money(selected.delivery_fee)} />
                        <TransactionDetailRow label="Service fee label" value={selected.service_fee_label_snapshot || '—'} />
                        <TransactionDetailRow label="Service fee method" value={selected.service_fee_method_snapshot || '—'} />
                        <TransactionDetailRow label="Discount" value={money(selected.discount_amount)} />
                        <TransactionDetailRow label="Discount preset" value={selected.discount_label_snapshot || '—'} />
                        <TransactionDetailRow label="Discount rate" value={selected.discount_rate_snapshot == null ? '—' : `${Number(selected.discount_rate_snapshot).toFixed(2)}%`} />
                        <TransactionDetailRow label="Discount type" value={selected.discount_type || '—'} />
                        <TransactionDetailRow label="Promo code" value={selected.promo_code || '—'} />
                      </TransactionDetailSection>
                    </>
                  )}
                </div>
              </div>
            </>
          ) : null}
        </DialogContent>
      </Dialog>

      <Dialog open={showExportPrecheck} onOpenChange={setShowExportPrecheck}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Export Sales CSV</DialogTitle>
            <DialogDescription>
              Confirm export scope before generating the file.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 text-sm">
            <p>
              <span className="text-slate-500">Rows:</span> {pagination?.total || rows.length}
            </p>
            <p>
              <span className="text-slate-500">Date range:</span> {dateFrom || 'Any'} to {dateTo || 'Any'}
            </p>
            <p>
              <span className="text-slate-500">Source:</span> {source}
            </p>
            <p>
              <span className="text-slate-500">Filters:</span> {activeFilterSummary || 'none'}
            </p>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setShowExportPrecheck(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              onClick={async () => {
                setShowExportPrecheck(false);
                await runExportCsv();
              }}
              disabled={exporting}
            >
              {exporting ? 'Exporting...' : 'Export CSV'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
