import React, { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, Loader2, RefreshCw, WalletCards } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  getTenantFinancialSummary,
  listTenantFinancialFeeHistory,
  listTenantFinancialSettlements,
  listTenantFinancialTransactions
} from '@/services/tenantRevenueService.js';

const php = (centavos) => new Intl.NumberFormat('en-PH', {
  style: 'currency',
  currency: 'PHP',
  minimumFractionDigits: 2
}).format(Number(centavos || 0) / 100);

export default function TenantRevenueReadOnlyPanel({ startDate, endDate }) {
  const [summary, setSummary] = useState({});
  const [transactions, setTransactions] = useState([]);
  const [settlements, setSettlements] = useState([]);
  const [policies, setPolicies] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = {
        ...(startDate ? { period_start: `${startDate}T00:00:00.000Z` } : {}),
        ...(endDate ? { period_end: `${endDate}T23:59:59.999Z` } : {})
      };
      const [summaryResult, transactionResult, settlementResult, policyResult] = await Promise.all([
        getTenantFinancialSummary(params),
        listTenantFinancialTransactions({ ...params, limit: 250 }),
        listTenantFinancialSettlements({ limit: 100 }),
        listTenantFinancialFeeHistory()
      ]);
      setSummary(summaryResult.data || {});
      setTransactions(transactionResult.data?.transactions || []);
      setSettlements(settlementResult.data?.batches || []);
      setPolicies(policyResult.data?.policies || []);
    } catch (loadError) {
      console.error('[TenantRevenueReadOnly] Failed to load', loadError);
      setError(loadError?.response?.data?.message || loadError.message || 'Financial statements are unavailable.');
    } finally {
      setLoading(false);
    }
  }, [endDate, startDate]);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) {
    return <div className="flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white p-12 text-slate-500"><Loader2 className="h-5 w-5 animate-spin" />Loading settlement statements…</div>;
  }

  if (error) {
    return <div className="flex gap-3 rounded-xl border border-rose-200 bg-rose-50 p-5 text-rose-800"><AlertTriangle className="h-5 w-5 shrink-0" /><div><strong>Tenant financial view unavailable.</strong><div className="text-sm">{error}</div></div></div>;
  }

  const latestPolicy = policies[0] || null;
  const cards = [
    ['Gross sales', summary.totals?.gross_centavos],
    ['PayMongo fees', summary.totals?.provider_fee_centavos],
    ['DGFY fees', summary.totals?.dgfy_fee_centavos],
    ['Refunds', summary.totals?.refund_centavos],
    ['Net payable', summary.totals?.tenant_payable_centavos],
    ['Pending settlement', summary.totals?.unsettled_centavos],
    ['Paid to tenant', summary.totals?.settled_centavos]
  ];

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3"><WalletCards className="mt-0.5 h-6 w-6 text-blue-600" /><div><h2 className="text-lg font-bold text-slate-900">Tenant Revenue & Settlement</h2><p className="text-sm text-slate-500">Read-only view of your company’s PayMongo collections, fees, payable balance, and completed settlements.</p></div></div>
        <Button variant="outline" onClick={load}><RefreshCw className="mr-2 h-4 w-4" />Refresh</Button>
      </div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {cards.map(([label, value]) => <div key={label} className="rounded-xl border border-slate-200 bg-white p-4"><div className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</div><div className="mt-1 text-lg font-bold tabular-nums text-slate-900">{php(value)}</div></div>)}
      </div>
      <div className="grid gap-4 lg:grid-cols-[1.5fr_1fr]">
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
          <div className="border-b border-slate-200 p-4"><h3 className="font-semibold text-slate-900">Payment statement</h3></div>
          <div className="overflow-x-auto"><table className="min-w-full text-sm"><thead className="bg-slate-50 text-left text-xs uppercase text-slate-500"><tr><th className="p-3">Paid</th><th className="p-3">Reference</th><th className="p-3 text-right">Gross</th><th className="p-3 text-right">Fees</th><th className="p-3 text-right">Net payable</th><th className="p-3">Settlement</th></tr></thead><tbody className="divide-y divide-slate-100">{transactions.map((row) => <tr key={row.revenue_transaction_id}><td className="p-3">{new Date(row.paid_at).toLocaleDateString('en-PH')}</td><td className="p-3 font-mono text-xs">{row.provider_payment_id}</td><td className="p-3 text-right tabular-nums">{php(row.gross_amount_centavos)}</td><td className="p-3 text-right tabular-nums">{php(Number(row.provider_fee_centavos || 0) + Number(row.dgfy_fee_centavos || 0))}</td><td className="p-3 text-right font-semibold tabular-nums">{php(row.tenant_net_payable_centavos)}</td><td className="p-3 capitalize">{String(row.settlement_status).replaceAll('_', ' ')}</td></tr>)}{!transactions.length ? <tr><td colSpan={6} className="p-10 text-center text-slate-500">No online tenant payments for this period.</td></tr> : null}</tbody></table></div>
        </div>
        <div className="space-y-4">
          <div className="rounded-xl border border-slate-200 bg-white p-4"><h3 className="font-semibold">Current fee policy</h3>{latestPolicy ? <div className="mt-3 space-y-1 text-sm"><div>DGFY rate: <strong>{(Number(latestPolicy.dgfy_rate_bps) / 100).toFixed(2)}%</strong></div><div>Cycle: {latestPolicy.settlement_cycle_days} days</div><div>Provider fee: {latestPolicy.provider_fee_payer}</div><div>Status: {latestPolicy.settlement_status}</div><div>Effective: {new Date(latestPolicy.effective_at).toLocaleDateString('en-PH')}</div></div> : <p className="mt-2 text-sm text-slate-500">No fee policy published.</p>}</div>
          <div className="rounded-xl border border-slate-200 bg-white p-4"><h3 className="font-semibold">Settlement statements</h3><div className="mt-3 space-y-2">{settlements.map((batch) => <div key={batch.settlement_batch_id} className="rounded-lg bg-slate-50 p-3 text-sm"><div className="font-mono text-xs">{batch.batch_number}</div><div className="mt-1 flex justify-between"><span className="capitalize">{String(batch.status).replaceAll('_', ' ')}</span><strong className="tabular-nums">{php(batch.payout_centavos)}</strong></div><div className="mt-1 text-xs text-slate-500">Transfer: {batch.actual_payout_at ? new Date(batch.actual_payout_at).toLocaleDateString('en-PH') : 'Not paid'}</div></div>)}{!settlements.length ? <p className="text-sm text-slate-500">No settlement statements yet.</p> : null}</div></div>
        </div>
      </div>
    </div>
  );
}
