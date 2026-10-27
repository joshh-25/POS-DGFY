import React, { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, Loader2, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import * as adminService from '@/services/adminService';

const EMPTY_DATA = { dashboard: null, transactions: [], batches: [], exceptions: [], policies: [], adjustments: [] };
const peso = (centavos) => `₱${(Number(centavos || 0) / 100).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const dateLabel = (value) => value ? new Date(value).toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric' }) : 'Not scheduled';

export default function TenantRevenueReadOnlyPanel({ tenant }) {
    const [data, setData] = useState(EMPTY_DATA);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    const load = useCallback(async () => {
        setLoading(true);
        setError('');
        const tenantFilter = { tenant_id: tenant.id };
        try {
            const [dashboard, transactions, batches, exceptions, policies, adjustments] = await Promise.all([
                adminService.getTenantRevenueDashboard(tenantFilter),
                adminService.listTenantRevenueTransactions({ ...tenantFilter, limit: 100 }),
                adminService.listTenantSettlementBatches(tenantFilter),
                adminService.listTenantRevenueReconciliation({ ...tenantFilter, status: 'open', limit: 100 }),
                adminService.listTenantRevenueFeePolicies(tenant.id),
                adminService.listTenantRevenueAdjustments({ ...tenantFilter, limit: 100 })
            ]);
            setData({
                dashboard: dashboard?.data || null,
                transactions: transactions?.data?.transactions || [],
                batches: batches?.data?.batches || [],
                exceptions: exceptions?.data?.records || [],
                policies: policies?.data?.policies || [],
                adjustments: adjustments?.data?.adjustments || []
            });
        } catch (requestError) {
            setError(requestError?.response?.data?.message || requestError?.message || 'Financial records could not be loaded.');
        } finally {
            setLoading(false);
        }
    }, [tenant.id]);

    useEffect(() => { void load(); }, [load]);

    const dashboard = data.dashboard || {};
    const totals = dashboard.totals || {};
    const summary = [
        ['Gross sales', peso(totals.gross_centavos)],
        ['DGFY earnings', peso(totals.dgfy_fee_centavos)],
        ['Pending settlement', peso(totals.pending_centavos)],
        ['Paid to tenant', peso(totals.settled_centavos)],
        ['Open exceptions', dashboard.counts?.open_exceptions || 0]
    ];

    return (
        <section aria-label="Read-only tenant revenue and settlement" className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
            <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-slate-50 p-4">
                <div><h3 className="font-semibold text-slate-900">Financial records</h3><p className="text-sm text-slate-500">Viewing is available. Archived tenants cannot be changed here.</p></div>
                <Button type="button" variant="outline" onClick={() => void load()} disabled={loading}><RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />Refresh</Button>
            </header>
            {error ? <div role="alert" className="m-4 flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />{error}</div> : null}
            {loading ? <div role="status" className="p-8 text-center text-sm text-slate-600"><Loader2 className="mr-2 inline h-4 w-4 animate-spin" />Loading financial records…</div> : null}
            {!loading && !error ? (
                <div className="space-y-5 p-4">
                    <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
                        {summary.map(([label, value]) => <div key={label} className="rounded-lg border border-slate-200 bg-slate-50 p-3"><div className="text-xs font-medium uppercase text-slate-500">{label}</div><div className="mt-1 font-semibold tabular-nums text-slate-900">{value}</div></div>)}
                    </div>
                    <section><h4 className="font-semibold text-slate-900">Recent transactions</h4><div className="mt-2 space-y-2">{data.transactions.slice(0, 20).map((row) => <article key={row.revenue_transaction_id} className="flex flex-wrap justify-between gap-2 rounded-lg border border-slate-200 p-3 text-sm"><span>{row.provider_payment_id || row.revenue_transaction_id}</span><span>{peso(row.gross_amount_centavos)} · {row.settlement_status || row.status}</span></article>)}{!data.transactions.length ? <p className="text-sm text-slate-500">No revenue transactions.</p> : null}</div></section>
                    <section><h4 className="font-semibold text-slate-900">Settlement batches</h4><div className="mt-2 space-y-2">{data.batches.slice(0, 20).map((batch) => <article key={batch.settlement_batch_id} className="flex flex-wrap justify-between gap-2 rounded-lg border border-slate-200 p-3 text-sm"><span>{batch.batch_number} · {dateLabel(batch.period_start)}–{dateLabel(batch.period_end)}</span><span>{peso(batch.payout_centavos)} · {batch.status}</span></article>)}{!data.batches.length ? <p className="text-sm text-slate-500">No settlement batches.</p> : null}</div></section>
                    <section><h4 className="font-semibold text-slate-900">Open reconciliation exceptions</h4><div className="mt-2 space-y-2">{data.exceptions.map((record) => <article key={record.reconciliation_id} className="rounded-lg border border-rose-200 bg-rose-50/40 p-3 text-sm"><strong>{String(record.exception_type || 'Exception').replace(/_/g, ' ')}</strong><p className="mt-1 text-slate-600">{record.reason || record.description || 'Review recorded financial evidence.'}</p></article>)}{!data.exceptions.length ? <p className="text-sm text-slate-500">No open reconciliation exceptions.</p> : null}</div></section>
                    <section><h4 className="font-semibold text-slate-900">Fee configuration history</h4><div className="mt-2 space-y-2">{data.policies.map((policy) => <article key={policy.policy_id} className="rounded-lg border border-slate-200 p-3 text-sm"><strong>Version {policy.version}</strong> · {(Number(policy.dgfy_rate_bps) / 100).toFixed(2)}% · {policy.settlement_cycle_days} days<p className="mt-1 text-slate-500">{policy.reason}</p></article>)}{!data.policies.length ? <p className="text-sm text-slate-500">No fee policy versions.</p> : null}</div></section>
                    <section>
                        <h4 className="font-semibold text-slate-900">Adjustment history</h4>
                        <div className="mt-2 space-y-2">
                            {data.adjustments.map((adjustment) => (
                                <article key={adjustment.adjustment_id} className="rounded-lg border border-slate-200 p-3 text-sm">
                                    <div className="flex flex-wrap justify-between gap-2">
                                        <strong>{peso(adjustment.amount_centavos)} · {adjustment.status}</strong>
                                        <span className="text-xs text-slate-500">{dateLabel(adjustment.created_at)}</span>
                                    </div>
                                    <p className="mt-1 text-slate-600">{adjustment.reason || 'No reason recorded.'}</p>
                                    <p className="mt-1 text-xs text-slate-500">Transaction {adjustment.revenue_transaction_id || 'not linked'} · Requested by {adjustment.requested_by || 'unknown'}</p>
                                </article>
                            ))}
                            {!data.adjustments.length ? <p className="text-sm text-slate-500">No adjustment records.</p> : null}
                        </div>
                    </section>
                </div>
            ) : null}
        </section>
    );
}
