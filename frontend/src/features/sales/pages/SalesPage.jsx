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

const money = (value) => `PHP ${Number(value || 0).toFixed(2)}`;

export default function SalesPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const { loading: permissionLoading, can } = usePermission();
  const { workflowMode } = useWorkflowMode();
  const isMsmeMode = isMsmeWorkflowMode(workflowMode);
  const canView = can('reports:view') || can('do:view') || can('pos:view') || can('pos:transact');
  const hydratedFromQueryRef = useRef(false);
  const msmeDefaultsAppliedRef = useRef(false);
  const [search, setSearch] = useState('');
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
  const [sourceContext, setSourceContext] = useState('');
  const [showExportPrecheck, setShowExportPrecheck] = useState(false);
  const [lastExportMeta, setLastExportMeta] = useState(null);
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);

  useEffect(() => {
    if (hydratedFromQueryRef.current) return;
    const params = new URLSearchParams(location.search);
    const sourceParam = String(params.get('source') || '').toUpperCase();
    if (['ALL', 'POS', 'DISPATCH'].includes(sourceParam)) {
      setSource(sourceParam);
    }
    setSearch(params.get('search') || '');
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
        setSelected((prev) => sourceIdMatch || prev || result.transactions[0]);
      }
    } catch (error) {
      toast.error(error?.response?.data?.message || 'Failed to load unified sales');
    } finally {
      setLoading(false);
    }
  }, [dateFrom, dateTo, orderMethod, paymentType, search, sortBy, sortOrder, source, sourceId, status, posOrderSource]);

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
    if (sourceId) parts.push(`source_id=${sourceId}`);
    if (status !== 'all') parts.push(`status=${status}`);
    if (paymentType !== 'all') parts.push(`payment=${paymentType}`);
    if (orderMethod !== 'all') parts.push(`order_method=${orderMethod}`);
    if (posOrderSource !== 'all') parts.push(`pos_order_source=${posOrderSource}`);
    if (dateFrom) parts.push(`date_from=${dateFrom}`);
    if (dateTo) parts.push(`date_to=${dateTo}`);
    if (search) parts.push(`search="${search}"`);
    return parts.join(', ');
  }, [dateFrom, dateTo, orderMethod, paymentType, search, source, sourceId, status, posOrderSource]);

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

  const runExportCsv = async () => {
    setExporting(true);
    try {
      const exportDate = new Date().toISOString().slice(0, 10);
      const filename = `sales_timeline_${exportDate}.csv`;
      const blob = await exportUnifiedSalesTransactionsCsv({
        search: search || undefined,
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
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Sales Timeline</h1>
        <p className="text-sm text-slate-500">Unified read-only sales view across POS and Dispatch transactions.</p>
      </div>
      {isMsmeMode && (
        <div className="rounded-lg border border-teal-200 bg-teal-50 px-3 py-2 text-xs text-teal-800">
          MSME Daily Snapshot mode is active. Defaults focus on today&apos;s cash POS sales. Use Advanced Filters for full reporting controls.
        </div>
      )}
      {sourceContext === 'pos_history' && (
        <div className="rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-xs text-sky-800">
          Opened from POS history. Filters are preserved for continuity from terminal review to sales reporting.
        </div>
      )}
      {lastExportMeta && (
        <div aria-live="polite" className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
          Export complete: <span className="font-semibold">{lastExportMeta.filename}</span> ({lastExportMeta.rowCount} row(s)).
          Filters: {lastExportMeta.filterSummary || 'none'}.
        </div>
      )}
      {isMsmeMode && msmeDailySnapshot && (
        <div className="grid gap-3 md:grid-cols-3">
          <div className="rounded-lg border border-slate-200 bg-white p-3">
            <p className="text-xs text-slate-500">Daily Gross Sales</p>
            <p className="text-base font-semibold text-slate-900">{money(msmeDailySnapshot.grossSales)}</p>
          </div>
          <div className="rounded-lg border border-slate-200 bg-white p-3">
            <p className="text-xs text-slate-500">Transactions</p>
            <p className="text-base font-semibold text-slate-900">{msmeDailySnapshot.transactionCount}</p>
          </div>
          <div className="rounded-lg border border-slate-200 bg-white p-3">
            <p className="text-xs text-slate-500">Average Ticket</p>
            <p className="text-base font-semibold text-slate-900">{money(msmeDailySnapshot.averageTicket)}</p>
          </div>
        </div>
      )}

      <section className="bg-white border border-slate-200 rounded-2xl p-4">
        <div className="flex flex-col lg:flex-row gap-3 lg:items-center lg:justify-between mb-4">
          <div className="flex flex-wrap gap-2">
            {!isMsmeMode && (
              <>
                <Button type="button" variant={source === 'ALL' ? 'default' : 'outline'} onClick={() => setSource('ALL')}>All</Button>
                <Button type="button" variant={source === 'POS' ? 'default' : 'outline'} onClick={() => setSource('POS')}>POS</Button>
                <Button type="button" variant={source === 'DISPATCH' ? 'default' : 'outline'} onClick={() => setSource('DISPATCH')}>Dispatch</Button>
              </>
            )}
            {isMsmeMode && (
              <span className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-700">
                Source: POS
              </span>
            )}
            <select
              value={status}
              onChange={(event) => setStatus(event.target.value)}
              className="border border-slate-200 rounded-lg px-2 py-2 text-sm"
            >
              <option value="all">All Status</option>
              <option value="completed">Completed</option>
              <option value="voided">Voided</option>
              <option value="draft">Draft</option>
              <option value="confirmed">Confirmed</option>
              <option value="partial">Partial</option>
              <option value="dispatched">Dispatched</option>
              <option value="cancelled">Cancelled</option>
            </select>
            <select
              value={paymentType}
              onChange={(event) => setPaymentType(event.target.value)}
              className="border border-slate-200 rounded-lg px-2 py-2 text-sm"
            >
              <option value="all">All Payments</option>
              <option value="cash">Cash</option>
              <option value="gcash">GCash</option>
              <option value="maya">Maya</option>
              <option value="card">Card</option>
              <option value="bank_transfer">Bank Transfer</option>
            </select>
            {(!isMsmeMode || showAdvancedFilters) && (
              <>
                <select
                  value={orderMethod}
                  onChange={(event) => setOrderMethod(event.target.value)}
                  className="border border-slate-200 rounded-lg px-2 py-2 text-sm"
                >
                  <option value="all">All Order Methods</option>
                  <option value="dine_in">Dine In</option>
                  <option value="takeout">Takeout</option>
                  <option value="pickup">Pickup</option>
                  <option value="delivery">Delivery</option>
                </select>
                <select
                  value={posOrderSource}
                  onChange={(event) => setPosOrderSource(event.target.value)}
                  className="border border-slate-200 rounded-lg px-2 py-2 text-sm"
                >
                  <option value="all">All POS Channels</option>
                  <option value="in_store">POS In-Store</option>
                  <option value="online_store">POS Online Store</option>
                </select>
                <select
                  value={sortBy}
                  onChange={(event) => setSortBy(event.target.value)}
                  className="border border-slate-200 rounded-lg px-2 py-2 text-sm"
                >
                  <option value="occurred_at">Sort: Date</option>
                  <option value="gross_sales">Sort: Gross</option>
                  <option value="cogs">Sort: COGS</option>
                  <option value="gross_profit">Sort: Profit</option>
                  <option value="reference_no">Sort: Reference</option>
                </select>
                <select
                  value={sortOrder}
                  onChange={(event) => setSortOrder(event.target.value)}
                  className="border border-slate-200 rounded-lg px-2 py-2 text-sm"
                >
                  <option value="desc">Desc</option>
                  <option value="asc">Asc</option>
                </select>
                <Input
                  value={sourceId}
                  onChange={(event) => setSourceId(event.target.value)}
                  placeholder="Txn ID"
                  className="w-28"
                  inputMode="numeric"
                />
              </>
            )}
            <Input type="date" value={dateFrom} max={dateTo || undefined} onChange={(event) => setDateFrom(event.target.value)} className="w-44" />
            <Input type="date" value={dateTo} min={dateFrom || undefined} onChange={(event) => setDateTo(event.target.value)} className="w-44" />
            {isMsmeMode && (
              <Button
                type="button"
                variant="outline"
                onClick={() => setShowAdvancedFilters((prev) => !prev)}
              >
                {showAdvancedFilters ? 'Hide Advanced' : 'Advanced Filters'}
              </Button>
            )}
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                setSearch('');
                setSource(isMsmeMode ? 'POS' : 'ALL');
                setSourceId('');
                setStatus(isMsmeMode ? 'completed' : 'all');
                setPaymentType(isMsmeMode ? 'cash' : 'all');
                setOrderMethod('all');
                setPosOrderSource('all');
                if (isMsmeMode) {
                  const today = new Date().toISOString().slice(0, 10);
                  setDateFrom(today);
                  setDateTo(today);
                } else {
                  setDateFrom('');
                  setDateTo('');
                }
                setSortBy('occurred_at');
                setSortOrder('desc');
                setSourceContext('');
              }}
            >
              Reset Filters
            </Button>
          </div>
          <div className="flex gap-2">
            <Input
              className="lg:max-w-sm"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search by invoice, DO number, recipient..."
            />
            <Button type="button" variant="outline" onClick={handleExportCsv} disabled={exporting}>
              {exporting ? 'Exporting...' : 'Export CSV'}
            </Button>
          </div>
        </div>

        {summary && (
          <div className="grid md:grid-cols-4 gap-3 mb-4">
            <div className="border border-slate-200 rounded-lg p-3">
              <p className="text-xs text-slate-500">Gross Sales (incl. service fee)</p>
              <p className="font-semibold text-slate-900">{money(summary.gross_sales)}</p>
            </div>
            <div className="border border-slate-200 rounded-lg p-3">
              <p className="text-xs text-slate-500">Service Fees</p>
              <p className="font-semibold text-slate-900">{money(summary.service_fee_total)}</p>
            </div>
            <div className="border border-slate-200 rounded-lg p-3">
              <p className="text-xs text-slate-500">COGS</p>
              <p className="font-semibold text-slate-900">{money(summary.cogs)}</p>
            </div>
            <div className="border border-slate-200 rounded-lg p-3">
              <p className="text-xs text-slate-500">Gross Profit</p>
              <p className="font-semibold text-slate-900">{money(summary.gross_profit)}</p>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
          <div className="xl:col-span-2 overflow-auto rounded-xl border border-slate-200" aria-busy={loading}>
            <table className="w-full min-w-[900px] text-sm" aria-label="Unified sales transactions table">
              <caption className="sr-only">Unified sales transactions with POS and dispatch sources</caption>
              <thead className="sticky top-0 bg-slate-50 z-10">
                <tr className="border-b border-slate-200 text-slate-500">
                  <th scope="col" className="text-left py-2 px-2">Source</th>
                  <th scope="col" className="text-left py-2 px-2">Reference</th>
                  <th scope="col" className="text-left py-2 px-2">Date</th>
                  <th scope="col" className="text-left py-2 px-2">Party</th>
                  <th scope="col" className="text-right py-2 px-2">Gross</th>
                  <th scope="col" className="text-right py-2 px-2">COGS</th>
                  <th scope="col" className="text-right py-2 px-2">Profit</th>
                  <th scope="col" className="text-left py-2 px-2">Status</th>
                  <th scope="col" className="text-right py-2 px-2">Action</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr
                    key={`${row.source}-${row.source_id}`}
                    className={`border-b border-slate-100 ${selected?.source_id === row.source_id && selected?.source === row.source ? 'bg-teal-50' : ''}`}
                  >
                    <td className="py-2 px-2">
                      <span className={`text-xs px-2 py-1 rounded-full ${row.source === 'POS' ? 'bg-indigo-100 text-indigo-700' : 'bg-emerald-100 text-emerald-700'}`}>
                        {row.source}
                      </span>
                      {row.source === 'POS' && row.pos_order_source && (
                        <span className={`ml-2 text-[11px] px-2 py-1 rounded-full ${
                          row.pos_order_source === 'online_store'
                            ? 'bg-sky-100 text-sky-700'
                            : 'bg-slate-200 text-slate-700'
                        }`}>
                          {row.pos_order_source === 'online_store' ? 'Online Store' : 'In-Store'}
                        </span>
                      )}
                    </td>
                    <td className="py-2 px-2 font-medium text-slate-900">{row.reference_no}</td>
                    <td className="py-2 px-2 text-slate-600">{new Date(row.occurred_at).toLocaleString()}</td>
                    <td className="py-2 px-2 text-slate-600">{row.customer_or_recipient || '-'}</td>
                    <td className="py-2 px-2 text-right text-slate-700">{money(row.gross_sales)}</td>
                    <td className="py-2 px-2 text-right text-slate-700">{money(row.cogs)}</td>
                    <td className="py-2 px-2 text-right font-semibold text-slate-900">{money(row.gross_profit)}</td>
                    <td className="py-2 px-2 text-slate-600">{row.status}</td>
                    <td className="py-2 px-2 text-right">
                      <Button
                        type="button"
                        size="sm"
                        variant={selected?.source_id === row.source_id && selected?.source === row.source ? 'secondary' : 'outline'}
                        onClick={() => setSelected(row)}
                        aria-label={`View transaction ${row.reference_no || row.source_id}`}
                      >
                        View
                      </Button>
                    </td>
                  </tr>
                ))}
                {!loading && rows.length === 0 && (
                  <tr>
                    <td colSpan={9} className="text-center py-8 text-slate-500">
                      No sales transactions found for current filters. Adjust date/source/search then retry export.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <div className="border border-slate-200 rounded-xl p-3 bg-slate-50" role="region" aria-live="polite" aria-label="Selected transaction detail">
            <h3 className="font-semibold text-slate-900 mb-2">Transaction Detail</h3>
            {!selected ? (
              <p className="text-sm text-slate-500">Select a sales row to inspect details.</p>
            ) : (
              <div className="space-y-2 text-sm">
                <p><span className="text-slate-500">Source:</span> {selected.source}</p>
                {selected.source === 'POS' && (
                  <p>
                    <span className="text-slate-500">POS Channel:</span>{' '}
                    {selected.pos_order_source === 'online_store' ? 'Online Store' : 'In-Store'}
                  </p>
                )}
                <p><span className="text-slate-500">Reference:</span> {selected.reference_no}</p>
                <p><span className="text-slate-500">Gross:</span> {money(selected.gross_sales)}</p>
                <p><span className="text-slate-500">COGS:</span> {money(selected.cogs)}</p>
                <p><span className="text-slate-500">Gross Profit:</span> {money(selected.gross_profit)}</p>
                {selected.source === 'POS' && (
                  <>
                    <p><span className="text-slate-500">Vatable:</span> {money(selected.vatable_sales)}</p>
                    <p><span className="text-slate-500">VAT:</span> {money(selected.vat_amount)}</p>
                    <p><span className="text-slate-500">VAT Exempt:</span> {money(selected.vat_exempt_sales)}</p>
                    <p><span className="text-slate-500">Zero Rated:</span> {money(selected.zero_rated_sales)}</p>
                    <p><span className="text-slate-500">Service Fee:</span> {money(selected.service_fee_amount)}</p>
                    <p><span className="text-slate-500">Delivery Fee:</span> {money(selected.delivery_fee)}</p>
                    <p><span className="text-slate-500">Payment Status:</span> {selected.payment_status || '-'}</p>
                    <p><span className="text-slate-500">Fulfillment Status:</span> {selected.fulfillment_status || '-'}</p>
                    <p><span className="text-slate-500">Service Fee Label:</span> {selected.service_fee_label_snapshot || '-'}</p>
                    <p><span className="text-slate-500">Service Fee Method:</span> {selected.service_fee_method_snapshot || '-'}</p>
                    <p><span className="text-slate-500">Discount:</span> {money(selected.discount_amount)}</p>
                    <p><span className="text-slate-500">Discount Preset:</span> {selected.discount_label_snapshot || '-'}</p>
                    <p><span className="text-slate-500">Discount Rate:</span> {selected.discount_rate_snapshot == null ? '-' : `${Number(selected.discount_rate_snapshot).toFixed(2)}%`}</p>
                    <p><span className="text-slate-500">Discount Type:</span> {selected.discount_type || '-'}</p>
                    <p><span className="text-slate-500">Promo Code:</span> {selected.promo_code || '-'}</p>
                  </>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="flex justify-end gap-2 mt-4">
          <Button type="button" variant="outline" disabled={loading || (pagination.page || 1) <= 1} onClick={() => loadSales((pagination.page || 1) - 1)}>
            Previous
          </Button>
          <Button type="button" variant="outline" disabled={loading || (pagination.page || 1) >= (pagination.totalPages || 1)} onClick={() => loadSales((pagination.page || 1) + 1)}>
            Next
          </Button>
        </div>
      </section>

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
