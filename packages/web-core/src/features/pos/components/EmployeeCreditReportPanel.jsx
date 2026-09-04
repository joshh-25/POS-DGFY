import { useEffect, useRef, useState } from 'react';
import { CreditCard, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { fetchEmployeeCreditReport } from '../services/employeeCreditService.js';

const money = (value, symbol = 'PHP') => `${symbol} ${Number(value || 0).toFixed(2)}`;
const formatDateTime = (value) => value ? new Date(value).toLocaleString() : '-';

export default function EmployeeCreditReportPanel({ dateFrom, dateTo, currencySymbol = 'PHP', refreshKey = 0, isOnline = true }) {
  const [data, setData] = useState({ entries: [], totals: {}, excluded_from_cashflow: true });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [manualRefreshKey, setManualRefreshKey] = useState(0);
  const requestSequence = useRef(0);

  useEffect(() => {
    const currentRequest = requestSequence.current + 1;
    requestSequence.current = currentRequest;

    if (!isOnline) {
      return undefined;
    }

    const controller = new AbortController();
    const requestTimer = window.setTimeout(() => {
      setLoading(true);
      setError('');

      fetchEmployeeCreditReport({
        date_from: dateFrom,
        date_to: dateTo,
        signal: controller.signal
      })
        .then((report) => {
          if (requestSequence.current === currentRequest) {
            setData(report);
          }
        })
        .catch((requestError) => {
          if (controller.signal.aborted || requestSequence.current !== currentRequest) return;
          setError(requestError?.response?.data?.message || requestError?.message || 'Failed to load Employee Credit report.');
        })
        .finally(() => {
          if (!controller.signal.aborted && requestSequence.current === currentRequest) {
            setLoading(false);
          }
        });
    }, 0);

    return () => {
      window.clearTimeout(requestTimer);
      controller.abort();
    };
  }, [dateFrom, dateTo, refreshKey, manualRefreshKey, isOnline]);

  return (
    <section className="rounded-2xl border border-blue-200 bg-blue-50/40 p-4 shadow-sm sm:p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white text-[#1A4E8D]"><CreditCard className="h-5 w-5" /></div>
          <div><h3 className="text-base font-black text-slate-950">Employee Credit Report</h3><p className="text-xs font-semibold text-blue-800">Open-tab non-cash ledger. These amounts are excluded from cash drawer totals.</p></div>
        </div>
        <Button type="button" variant="outline" size="sm" onClick={() => setManualRefreshKey((current) => current + 1)} disabled={loading || !isOnline}><RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />Refresh</Button>
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-xl border border-slate-200 bg-white p-3"><p className="text-xs font-bold uppercase text-slate-500">Credit sales</p><p className="mt-1 text-xl font-black text-slate-950">{money(data.totals?.credit_sales, currencySymbol)}</p></div>
        <div className="rounded-xl border border-slate-200 bg-white p-3"><p className="text-xs font-bold uppercase text-slate-500">Repayments</p><p className="mt-1 text-xl font-black text-emerald-700">{money(data.totals?.repayments, currencySymbol)}</p></div>
        <div className="rounded-xl border border-slate-200 bg-white p-3"><p className="text-xs font-bold uppercase text-slate-500">Admin adjustments</p><p className="mt-1 text-xl font-black text-slate-950">{money(data.totals?.grants, currencySymbol)}</p></div>
        <div className="rounded-xl border border-slate-200 bg-white p-3"><p className="text-xs font-bold uppercase text-slate-500">Reversals</p><p className="mt-1 text-xl font-black text-slate-950">{money(data.totals?.reversals, currencySymbol)}</p></div>
      </div>
      {!isOnline || error ? <p className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-800">{!isOnline ? 'Employee Credit reports require an online connection.' : error}</p> : null}
      <div className="mt-4 overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="min-w-[900px] w-full text-left text-xs">
          <thead className="bg-slate-50 text-slate-600"><tr><th className="px-3 py-2">Time</th><th className="px-3 py-2">Employee</th><th className="px-3 py-2">Type</th><th className="px-3 py-2 text-right">Amount</th><th className="px-3 py-2 text-right">Outstanding after</th><th className="px-3 py-2">Cashier</th><th className="px-3 py-2">Reference</th></tr></thead>
          <tbody>
            {(data.entries || []).map((entry) => <tr key={entry.ledger_entry_id} className="border-t border-slate-100"><td className="px-3 py-2">{formatDateTime(entry.created_at)}</td><td className="px-3 py-2 font-bold">{entry.account?.employeeProfile?.full_name || entry.account?.employee?.username || entry.account?.employee?.email || '-'}</td><td className="px-3 py-2 capitalize">{String(entry.entry_type || '').replace(/_/g, ' ')}</td><td className="px-3 py-2 text-right font-bold">{money(entry.amount, currencySymbol)}</td><td className="px-3 py-2 text-right">{money(entry.balance_after, currencySymbol)}</td><td className="px-3 py-2">{entry.actor?.username || '-'}</td><td className="px-3 py-2">{entry.authorization_reference || '-'}</td></tr>)}
            {!loading && (data.entries || []).length === 0 ? <tr><td colSpan="7" className="px-3 py-8 text-center font-semibold text-slate-500">No Employee Credit activity for this period.</td></tr> : null}
            {loading && (data.entries || []).length > 0 ? <tr><td colSpan="7" className="border-t border-slate-100 px-3 py-2 text-center font-semibold text-slate-500">Refreshing Employee Credit report...</td></tr> : null}
            {loading && (data.entries || []).length === 0 ? <tr><td colSpan="7" className="px-3 py-8 text-center font-semibold text-slate-500">Loading Employee Credit report...</td></tr> : null}
          </tbody>
        </table>
      </div>
    </section>
  );
}
