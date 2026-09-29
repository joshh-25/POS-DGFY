import React, { useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Download, ExternalLink, Loader2, Package } from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { formatNumber } from '@/lib/numberUtils.js';
import {
  exportBusinessAdminReportDataset,
  getBusinessAdminReportDataset
} from '../api/businessAdminReportsApi.js';

const REPORT_KEY = 'sales_and_stock_by_item';
const REPORT_PAGE_SIZE = 25;
const SORT_OPTIONS = Object.freeze([
  { value: 'units_sold', label: 'Units sold' },
  { value: 'quantity_on_hand', label: 'Stock left' },
  { value: 'min_threshold', label: 'Threshold' },
  { value: 'item_name', label: 'Item name' }
]);

const STATUS_META = Object.freeze({
  in_stock: { label: 'In stock', className: 'border-emerald-200 bg-emerald-50 text-emerald-700' },
  low_stock: { label: 'Low stock', className: 'border-amber-200 bg-amber-50 text-amber-700' },
  out_of_stock: { label: 'Out of stock', className: 'border-red-200 bg-red-50 text-red-700' }
});

const getErrorMessage = (error) => (
  error?.response?.data?.message
  || error?.response?.data?.error?.message
  || error?.message
  || 'Sales and stock data could not be loaded.'
);

const buildReportParams = (dateFilters = {}, page = 1, limit = REPORT_PAGE_SIZE, sortBy = 'units_sold', sortDirection = 'desc') => Object.fromEntries(
  Object.entries({
    date_from: dateFilters.startDate || undefined,
    date_to: dateFilters.endDate || undefined,
    branch_id: dateFilters.location_id || undefined,
    page,
    limit,
    sort_by: sortBy,
    sort_direction: sortDirection
  }).filter(([, value]) => value !== undefined)
);

const buildHandoffPath = (rootPath, section, values = {}) => {
  const query = new URLSearchParams();
  Object.entries(values).forEach(([key, value]) => {
    if (value !== undefined && value !== null && String(value).trim()) query.set(key, String(value));
  });
  const search = query.toString();
  return `${rootPath}/${section}${search ? `?${search}` : ''}`;
};

const downloadResponse = (response) => {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  const url = window.URL.createObjectURL(response.data);
  const link = document.createElement('a');
  const contentDisposition = response.headers?.['content-disposition'] || '';
  const filename = contentDisposition.match(/filename="?([^";]+)"?/)?.[1]
    || `sales-and-stock-${new Date().toISOString().slice(0, 10)}.csv`;
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(url);
};

export default function SalesStockReportPanel({ dateFilters }) {
  const location = useLocation();
  const [dataset, setDataset] = useState(null);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState('');
  const [page, setPage] = useState(1);
  const [sortBy, setSortBy] = useState('units_sold');
  const [sortDirection, setSortDirection] = useState('desc');
  const startDate = dateFilters?.startDate || '';
  const endDate = dateFilters?.endDate || '';
  const locationId = dateFilters?.location_id || '';
  const rootPath = location.pathname.startsWith('/backoffice') ? '/backoffice' : '/business-admin';
  const params = useMemo(
    () => buildReportParams({ startDate, endDate, location_id: locationId }, page, REPORT_PAGE_SIZE, sortBy, sortDirection),
    [endDate, locationId, page, sortBy, sortDirection, startDate]
  );

  useEffect(() => {
    setPage(1);
  }, [startDate, endDate, locationId, sortBy, sortDirection]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    getBusinessAdminReportDataset(REPORT_KEY, params)
      .then((result) => {
        if (!cancelled) setDataset(result);
      })
      .catch((requestError) => {
        if (!cancelled) {
          setDataset(null);
          setError(getErrorMessage(requestError));
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [params]);

  const handleExport = async () => {
    setExporting(true);
    setError('');
    try {
      const response = await exportBusinessAdminReportDataset(REPORT_KEY, { ...params, page: 1, limit: 5000, format: 'csv' });
      downloadResponse(response);
    } catch (requestError) {
      setError(getErrorMessage(requestError));
    } finally {
      setExporting(false);
    }
  };

  const rows = Array.isArray(dataset?.rows) ? dataset.rows : [];
  const total = Number(dataset?.pagination?.total ?? rows.length) || 0;
  const totalPages = Math.max(Number(dataset?.pagination?.total_pages) || Math.ceil(total / REPORT_PAGE_SIZE), 1);
  const currentPage = Math.min(Math.max(Number(dataset?.pagination?.page) || page, 1), totalPages);
  const reportSalesPath = buildHandoffPath(rootPath, 'sales', {
    date_from: startDate,
    date_to: endDate,
    source_context: 'reports_sales_stock'
  });
  const reportOrdersPath = buildHandoffPath(rootPath, 'orders', {
    date_from: startDate,
    date_to: endDate,
    branch_id: locationId
  });

  return (
    <section className="business-admin-reports-sales-stock rounded-2xl border border-slate-200 bg-white shadow-sm" aria-label="Sales and stock report">
      <header className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-100 px-5 py-4">
        <div className="flex min-w-0 items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-700">
            <Package className="h-5 w-5" />
          </span>
          <div>
            <h3 className="text-base font-bold text-slate-900">Sales &amp; stock</h3>
            <p className="mt-1 text-sm text-slate-500">See what sold and the current stock left by branch.</p>
          </div>
        </div>
        <div className="flex flex-wrap justify-end gap-2">
          <Link to={reportSalesPath} className="inline-flex h-9 items-center rounded-xl border border-slate-200 px-3 text-xs font-semibold text-slate-700 hover:border-blue-300 hover:bg-blue-50">
            <ExternalLink className="mr-2 h-3.5 w-3.5" /> Sales timeline
          </Link>
          <Link to={reportOrdersPath} className="inline-flex h-9 items-center rounded-xl border border-slate-200 px-3 text-xs font-semibold text-slate-700 hover:border-blue-300 hover:bg-blue-50">
            <ExternalLink className="mr-2 h-3.5 w-3.5" /> Order center
          </Link>
          <Button
            type="button"
            variant="outline"
            className="h-9 rounded-xl border-slate-200 text-slate-700"
            onClick={handleExport}
            disabled={loading || exporting}
          >
            {exporting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
            Export CSV
          </Button>
        </div>
      </header>

      <div className="flex flex-wrap items-end justify-between gap-3 border-b border-slate-100 px-5 py-3">
        <div className="flex flex-wrap items-end gap-3">
          <label className="grid gap-1 text-xs font-semibold text-slate-600">
            <span>Sort rows by</span>
            <select value={sortBy} onChange={(event) => setSortBy(event.target.value)} className="h-9 rounded-lg border border-slate-200 bg-white px-2.5 text-xs text-slate-700">
              {SORT_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
          </label>
          <div className="grid gap-1 text-xs font-semibold text-slate-600">
            <span>Direction</span>
            <div className="flex gap-1">
              <Button type="button" size="sm" variant={sortDirection === 'desc' ? 'secondary' : 'outline'} className="h-9 rounded-lg text-xs" onClick={() => setSortDirection('desc')}>Highest first</Button>
              <Button type="button" size="sm" variant={sortDirection === 'asc' ? 'secondary' : 'outline'} className="h-9 rounded-lg text-xs" onClick={() => setSortDirection('asc')}>Lowest first</Button>
            </div>
          </div>
        </div>
        <p className="m-0 text-xs text-slate-500">Summary rows stay read-only; use Sales timeline for transaction analysis and Order center for receipt-safe detail.</p>
      </div>

      {error ? (
        <div className="m-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700" role="alert">
          {error}
        </div>
      ) : loading ? (
        <div className="flex min-h-40 items-center justify-center text-slate-500">
          <Loader2 className="mr-2 h-5 w-5 animate-spin" />
          Loading sales and stock…
        </div>
      ) : rows.length === 0 ? (
        <div className="px-5 py-14 text-center text-sm text-slate-500">
          No stock-bearing item sales match the selected filters.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-left text-sm">
            <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-5 py-3">Item</th>
                <th className="px-4 py-3">Branch</th>
                <th className="px-4 py-3 text-right">Sold</th>
                <th className="px-4 py-3 text-right">Stock left</th>
                <th className="px-4 py-3 text-right">Threshold</th>
                <th className="px-5 py-3">Status</th>
                <th className="px-5 py-3">Investigate</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((row) => {
                const status = STATUS_META[row.stock_status] || STATUS_META.in_stock;
                return (
                  <tr key={`${row.item_id}-${row.branch_id}`} className="hover:bg-slate-50">
                    <td className="px-5 py-3.5">
                      <div className="font-semibold text-slate-900">{row.item_name || `Item #${row.item_id}`}</div>
                      {row.sku_code ? <div className="mt-0.5 text-xs text-slate-500">{row.sku_code}</div> : null}
                    </td>
                    <td className="px-4 py-3.5 text-slate-600">{row.branch || 'Unassigned'}</td>
                    <td className="px-4 py-3.5 text-right font-semibold text-slate-900">{formatNumber(row.units_sold)}</td>
                    <td className={`px-4 py-3.5 text-right font-semibold ${row.quantity_on_hand <= 0 ? 'text-red-700' : 'text-slate-900'}`}>
                      {formatNumber(row.quantity_on_hand)}
                    </td>
                    <td className="px-4 py-3.5 text-right text-slate-600">{formatNumber(row.min_threshold)}</td>
                    <td className="px-5 py-3.5">
                      <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${status.className}`}>
                        {status.label}
                      </span>
                    </td>
                    <td className="px-5 py-3.5">
                      <div className="flex flex-wrap gap-2">
                        <Link
                          to={buildHandoffPath(rootPath, 'sales', { item_id: row.item_id, date_from: startDate, date_to: endDate, source_context: 'reports_sales_stock' })}
                          className="text-xs font-semibold text-blue-700 hover:underline"
                        >
                          Analyze sales
                        </Link>
                        <Link
                          to={buildHandoffPath(rootPath, 'orders', { item_id: row.item_id, branch_id: row.branch_id > 0 ? row.branch_id : locationId, date_from: startDate, date_to: endDate })}
                          className="text-xs font-semibold text-blue-700 hover:underline"
                        >
                          Open orders
                        </Link>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {!loading && !error && rows.length > 0 ? (
        <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 px-5 py-3 text-xs text-slate-500">
          <span>{total} item{total === 1 ? '' : 's'} in scope · Stock left is the live branch balance.</span>
          {total > REPORT_PAGE_SIZE ? (
            <nav className="flex items-center gap-2" aria-label="Sales and stock report pagination">
              <Button type="button" variant="outline" size="sm" className="h-8 rounded-lg text-xs" onClick={() => setPage(currentPage - 1)} disabled={loading || currentPage <= 1} aria-label="Previous sales and stock page">
                <ChevronLeft className="mr-1 h-3.5 w-3.5" /> Previous
              </Button>
              <span>Page {currentPage} of {totalPages}</span>
              <Button type="button" variant="outline" size="sm" className="h-8 rounded-lg text-xs" onClick={() => setPage(currentPage + 1)} disabled={loading || currentPage >= totalPages} aria-label="Next sales and stock page">
                Next <ChevronRight className="ml-1 h-3.5 w-3.5" />
              </Button>
            </nav>
          ) : null}
        </footer>
      ) : null}
    </section>
  );
}
