import React, { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { fetchUnifiedSalesTransactions, exportUnifiedSalesTransactionsCsv } from '@/services/salesService';
import { usePermission } from '@/hooks/usePermission';
import { Navigate } from 'react-router-dom';

const money = (value) => `PHP ${Number(value || 0).toFixed(2)}`;

export default function SalesPage() {
  const { loading: permissionLoading, can } = usePermission();
  const canView = can('reports:view') || can('do:view') || can('pos:view') || can('pos:transact');
  const [search, setSearch] = useState('');
  const [source, setSource] = useState('ALL');
  const [status, setStatus] = useState('all');
  const [paymentType, setPaymentType] = useState('all');
  const [orderMethod, setOrderMethod] = useState('all');
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

  const loadSales = useCallback(async (page = 1) => {
    setLoading(true);
    try {
      const result = await fetchUnifiedSalesTransactions({
        page,
        limit: 20,
        search: search || undefined,
        source: source === 'ALL' ? undefined : source,
        status: status === 'all' ? undefined : status,
        payment_type: paymentType === 'all' ? undefined : paymentType,
        order_method: orderMethod === 'all' ? undefined : orderMethod,
        date_from: dateFrom || undefined,
        date_to: dateTo || undefined,
        sort_by: sortBy,
        sort_order: sortOrder
      });
      setRows(result.transactions || []);
      setPagination(result.pagination || { page: 1, totalPages: 1 });
      setSummary(result.summary || null);
      if (result.transactions?.length) {
        setSelected((prev) => prev || result.transactions[0]);
      }
    } catch (error) {
      toast.error(error?.response?.data?.message || 'Failed to load unified sales');
    } finally {
      setLoading(false);
    }
  }, [dateFrom, dateTo, orderMethod, paymentType, search, sortBy, sortOrder, source, status]);

  useEffect(() => {
    const timer = setTimeout(() => loadSales(1), 250);
    return () => clearTimeout(timer);
  }, [loadSales]);

  const handleExportCsv = async () => {
    setExporting(true);
    try {
      const blob = await exportUnifiedSalesTransactionsCsv({
        search: search || undefined,
        source: source === 'ALL' ? undefined : source,
        status: status === 'all' ? undefined : status,
        payment_type: paymentType === 'all' ? undefined : paymentType,
        order_method: orderMethod === 'all' ? undefined : orderMethod,
        date_from: dateFrom || undefined,
        date_to: dateTo || undefined,
        sort_by: sortBy,
        sort_order: sortOrder
      });
      const url = window.URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `sales_timeline_${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.URL.revokeObjectURL(url);
      toast.success('Sales CSV exported');
    } catch (error) {
      toast.error(error?.response?.data?.message || 'Failed to export unified sales');
    } finally {
      setExporting(false);
    }
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

      <section className="bg-white border border-slate-200 rounded-2xl p-4">
        <div className="flex flex-col lg:flex-row gap-3 lg:items-center lg:justify-between mb-4">
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant={source === 'ALL' ? 'default' : 'outline'} onClick={() => setSource('ALL')}>All</Button>
            <Button type="button" variant={source === 'POS' ? 'default' : 'outline'} onClick={() => setSource('POS')}>POS</Button>
            <Button type="button" variant={source === 'DISPATCH' ? 'default' : 'outline'} onClick={() => setSource('DISPATCH')}>Dispatch</Button>
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
            <select
              value={orderMethod}
              onChange={(event) => setOrderMethod(event.target.value)}
              className="border border-slate-200 rounded-lg px-2 py-2 text-sm"
            >
              <option value="all">All Order Methods</option>
              <option value="dine_in">Dine In</option>
              <option value="takeout">Takeout</option>
              <option value="delivery">Delivery</option>
              <option value="online">Online</option>
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
            <Input type="date" value={dateFrom} max={dateTo || undefined} onChange={(event) => setDateFrom(event.target.value)} className="w-44" />
            <Input type="date" value={dateTo} min={dateFrom || undefined} onChange={(event) => setDateTo(event.target.value)} className="w-44" />
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
          <div className="xl:col-span-2 overflow-auto">
            <table className="w-full min-w-[900px] text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-slate-500">
                  <th className="text-left py-2">Source</th>
                  <th className="text-left py-2">Reference</th>
                  <th className="text-left py-2">Date</th>
                  <th className="text-left py-2">Party</th>
                  <th className="text-right py-2">Gross</th>
                  <th className="text-right py-2">COGS</th>
                  <th className="text-right py-2">Profit</th>
                  <th className="text-left py-2">Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr
                    key={`${row.source}-${row.source_id}`}
                    className={`border-b border-slate-100 cursor-pointer ${selected?.source_id === row.source_id && selected?.source === row.source ? 'bg-teal-50' : ''}`}
                    onClick={() => setSelected(row)}
                  >
                    <td className="py-2">
                      <span className={`text-xs px-2 py-1 rounded-full ${row.source === 'POS' ? 'bg-indigo-100 text-indigo-700' : 'bg-emerald-100 text-emerald-700'}`}>
                        {row.source}
                      </span>
                    </td>
                    <td className="py-2 font-medium text-slate-900">{row.reference_no}</td>
                    <td className="py-2 text-slate-600">{new Date(row.occurred_at).toLocaleString()}</td>
                    <td className="py-2 text-slate-600">{row.customer_or_recipient || '-'}</td>
                    <td className="py-2 text-right text-slate-700">{money(row.gross_sales)}</td>
                    <td className="py-2 text-right text-slate-700">{money(row.cogs)}</td>
                    <td className="py-2 text-right font-semibold text-slate-900">{money(row.gross_profit)}</td>
                    <td className="py-2 text-slate-600">{row.status}</td>
                  </tr>
                ))}
                {!loading && rows.length === 0 && (
                  <tr>
                    <td colSpan={8} className="text-center py-8 text-slate-500">No sales transactions found.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <div className="border border-slate-200 rounded-xl p-3 bg-slate-50">
            <h3 className="font-semibold text-slate-900 mb-2">Transaction Detail</h3>
            {!selected ? (
              <p className="text-sm text-slate-500">Select a sales row to inspect details.</p>
            ) : (
              <div className="space-y-2 text-sm">
                <p><span className="text-slate-500">Source:</span> {selected.source}</p>
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
                    <p><span className="text-slate-500">Service Fee Label:</span> {selected.service_fee_label_snapshot || '-'}</p>
                    <p><span className="text-slate-500">Service Fee Method:</span> {selected.service_fee_method_snapshot || '-'}</p>
                    <p><span className="text-slate-500">Discount:</span> {money(selected.discount_amount)}</p>
                    <p><span className="text-slate-500">Discount Preset:</span> {selected.discount_label_snapshot || '-'}</p>
                    <p><span className="text-slate-500">Discount Rate:</span> {selected.discount_rate_snapshot == null ? '-' : `${Number(selected.discount_rate_snapshot).toFixed(2)}%`}</p>
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
    </div>
  );
}
