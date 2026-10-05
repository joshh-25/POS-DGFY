import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
    AlertTriangle,
    Banknote,
    CheckCircle2,
    Download,
    FileWarning,
    Landmark,
    Loader2,
    Printer,
    RefreshCw,
    Scale,
    Settings2,
    WalletCards
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import * as adminService from '@/services/adminService';
import { toast } from 'sonner';
import {
    createDefaultTenantRevenuePolicyForm,
    policyToEditableForm
} from './tenantRevenuePolicyForm';

const today = () => new Date().toISOString().slice(0, 10);
const monthStart = () => {
    const date = new Date();
    date.setDate(1);
    return date.toISOString().slice(0, 10);
};
const pesos = (centavos) => new Intl.NumberFormat('en-PH', {
    style: 'currency',
    currency: 'PHP',
    minimumFractionDigits: 2
}).format(Number(centavos || 0) / 100);
const dateTime = (value) => value ? new Date(value).toLocaleString('en-PH') : '—';
const dateOnly = (value) => value ? new Date(value).toLocaleDateString('en-PH') : '—';

const EMPTY_DASHBOARD = {
    feature: {},
    totals: {},
    counts: {},
    recent_transactions: [],
    recent_batches: [],
    recent_payouts: [],
    open_exceptions: []
};

const statusClass = (status) => {
    if (['paid', 'settled', 'reconciled', 'active', 'approved'].includes(status)) {
        return 'border-emerald-200 bg-emerald-50 text-emerald-700';
    }
    if (['failed', 'exception', 'reversed', 'blocking'].includes(status)) {
        return 'border-rose-200 bg-rose-50 text-rose-700';
    }
    if (['on_hold', 'suspended', 'pending', 'prepared', 'scheduled', 'processing'].includes(status)) {
        return 'border-amber-200 bg-amber-50 text-amber-800';
    }
    return 'border-slate-200 bg-slate-50 text-slate-700';
};

const StatusBadge = ({ value }) => (
    <span className={`inline-flex rounded-full border px-2 py-0.5 text-[11px] font-semibold capitalize ${statusClass(value)}`}>
        {String(value || 'unknown').replace(/_/g, ' ')}
    </span>
);

const SummaryCard = ({ label, value, tone = 'slate' }) => {
    const tones = {
        slate: 'bg-slate-50 text-slate-900',
        blue: 'bg-blue-50 text-blue-900',
        green: 'bg-emerald-50 text-emerald-900',
        amber: 'bg-amber-50 text-amber-900'
    };
    return (
        <div className={`rounded-lg border border-slate-200 p-3 ${tones[tone]}`}>
            <div className="text-[11px] font-semibold uppercase tracking-wide opacity-70">{label}</div>
            <div className="mt-1 text-lg font-bold tabular-nums">{value}</div>
        </div>
    );
};

export default function TenantRevenueSettlementPanel({ tenants = [] }) {
    const [activeTab, setActiveTab] = useState('overview');
    const [tenantId, setTenantId] = useState('');
    const [periodStart, setPeriodStart] = useState(monthStart());
    const [periodEnd, setPeriodEnd] = useState(today());
    const [transactionFilters, setTransactionFilters] = useState({
        company_id: '',
        branch_id: '',
        payment_method: '',
        payment_status: '',
        settlement_status: '',
        provider_payment_id: '',
        settlement_reference: ''
    });
    const [dashboard, setDashboard] = useState(EMPTY_DASHBOARD);
    const [transactions, setTransactions] = useState([]);
    const [batches, setBatches] = useState([]);
    const [policies, setPolicies] = useState([]);
    const [exceptions, setExceptions] = useState([]);
    const [adjustments, setAdjustments] = useState([]);
    const [selectedTransaction, setSelectedTransaction] = useState(null);
    const [loading, setLoading] = useState(false);
    const [actionLoading, setActionLoading] = useState('');
    const [error, setError] = useState('');
    const [actionReason, setActionReason] = useState('');
    const [providerReference, setProviderReference] = useState('');
    const [proofReference, setProofReference] = useState('');
    const [customPayoutDate, setCustomPayoutDate] = useState(today());
    const [adjustmentForm, setAdjustmentForm] = useState({
        revenue_transaction_id: '',
        amount_pesos: '',
        reason: ''
    });
    const [statementReference, setStatementReference] = useState('');
    const [statementRows, setStatementRows] = useState('');
    const [policyForm, setPolicyForm] = useState(() => createDefaultTenantRevenuePolicyForm(today()));
    const latestPolicy = policies[0] || null;

    const filters = useMemo(() => ({
        ...(tenantId ? { tenant_id: tenantId } : {}),
        ...Object.fromEntries(
            Object.entries(transactionFilters).filter(([, value]) => String(value).trim() !== '')
        ),
        period_start: periodStart,
        period_end: `${periodEnd}T23:59:59.999Z`
    }), [periodEnd, periodStart, tenantId, transactionFilters]);

    const loadRevenue = useCallback(async () => {
        setLoading(true);
        setError('');
        try {
            const requests = [
                adminService.getTenantRevenueDashboard(filters),
                adminService.listTenantRevenueTransactions({ ...filters, limit: 250 }),
                adminService.listTenantSettlementBatches(tenantId ? { tenant_id: tenantId } : {}),
                adminService.listTenantRevenueReconciliation({
                    ...(tenantId ? { tenant_id: tenantId } : {}),
                    status: 'open',
                    limit: 250
                }),
                tenantId ? adminService.listTenantRevenueFeePolicies(tenantId) : Promise.resolve({ data: { policies: [] } }),
                adminService.listTenantRevenueAdjustments({
                    ...(tenantId ? { tenant_id: tenantId } : {}),
                    limit: 200
                })
            ];
            const [dashboardResult, transactionsResult, batchesResult, exceptionsResult, policiesResult, adjustmentsResult] = await Promise.all(requests);
            setDashboard(dashboardResult.data || EMPTY_DASHBOARD);
            setTransactions(transactionsResult.data?.transactions || []);
            setBatches(batchesResult.data?.batches || []);
            setExceptions(exceptionsResult.data?.records || []);
            setPolicies(policiesResult.data?.policies || []);
            setAdjustments(adjustmentsResult.data?.adjustments || []);
        } catch (loadError) {
            console.error('[TenantRevenue] Failed to load revenue workspace', loadError);
            const message = loadError?.response?.data?.message || loadError.message || 'Failed to load revenue and settlement data.';
            setError(message);
        } finally {
            setLoading(false);
        }
    }, [filters, tenantId]);

    useEffect(() => {
        loadRevenue();
    }, [loadRevenue]);

    useEffect(() => {
        if (!tenantId) {
            setPolicyForm(createDefaultTenantRevenuePolicyForm(today()));
            return;
        }
        if (latestPolicy) {
            setPolicyForm(policyToEditableForm(latestPolicy, today()));
        }
    }, [latestPolicy, tenantId]);

    const handleTenantChange = (event) => {
        setPolicies([]);
        setPolicyForm(createDefaultTenantRevenuePolicyForm(today()));
        setTenantId(event.target.value);
    };

    const runAction = async (key, operation, successMessage) => {
        setActionLoading(key);
        try {
            await operation();
            toast.success(successMessage);
            await loadRevenue();
        } catch (actionError) {
            console.error(`[TenantRevenue] ${key} failed`, actionError);
            toast.error(actionError?.response?.data?.message || actionError.message || 'Financial action failed.');
        } finally {
            setActionLoading('');
        }
    };

    const submitPolicy = async (event) => {
        event.preventDefault();
        if (!tenantId) {
            toast.error('Select one tenant before creating a fee policy.');
            return;
        }
        const hasPayoutDestination = policyForm.payout_provider.trim()
            || policyForm.payout_account_name.trim()
            || policyForm.payout_account_number.trim();
        const payload = {
            dgfy_rate_bps: Math.round(Number(policyForm.dgfy_percentage || 0) * 100),
            settlement_cycle_days: Number(policyForm.settlement_cycle_days),
            settlement_status: policyForm.settlement_status,
            minimum_payout_centavos: Math.round(Number(policyForm.minimum_payout_pesos || 0) * 100),
            provider_fee_payer: policyForm.provider_fee_payer,
            shared_fee_tenant_bps: policyForm.provider_fee_payer === 'shared'
                ? Math.round(Number(policyForm.shared_fee_percentage || 0) * 100)
                : null,
            fallback_fee_policy: policyForm.fallback_rate_percentage !== ''
                || policyForm.fallback_fixed_pesos !== ''
                ? {
                    [policyForm.fallback_method]: {
                        rate_bps: Math.round(Number(policyForm.fallback_rate_percentage || 0) * 100),
                        fixed_centavos: Math.round(Number(policyForm.fallback_fixed_pesos || 0) * 100)
                    }
                }
                : null,
            automatic_payout_enabled: false,
            effective_at: `${policyForm.effective_at}T00:00:00.000Z`,
            reason: policyForm.reason,
            ...(hasPayoutDestination ? {
                payout_destination: {
                    type: policyForm.payout_type,
                    provider: policyForm.payout_provider,
                    account_name: policyForm.payout_account_name,
                    account_number: policyForm.payout_account_number
                }
            } : {})
        };
        await runAction(
            'policy',
            () => adminService.createTenantRevenueFeePolicy(tenantId, payload),
            'A new tenant fee policy version was created.'
        );
        setPolicyForm((current) => ({ ...current, reason: '', payout_account_number: '' }));
    };

    const createBatch = () => {
        if (!tenantId) {
            toast.error('Select one tenant before preparing a settlement batch.');
            return;
        }
        runAction(
            'batch:create',
            () => adminService.createTenantSettlementBatch({
                tenant_id: tenantId,
                period_start: `${periodStart}T00:00:00.000Z`,
                period_end: `${periodEnd}T23:59:59.999Z`
            }),
            'Settlement batch prepared for independent approval.'
        );
    };

    const requestAdjustment = () => {
        if (!tenantId) {
            toast.error('Select one tenant before requesting an adjustment.');
            return;
        }
        runAction(
            'adjustment:create',
            () => adminService.requestTenantRevenueAdjustment({
                tenant_id: tenantId,
                revenue_transaction_id: adjustmentForm.revenue_transaction_id,
                amount_centavos: Math.round(Number(adjustmentForm.amount_pesos || 0) * 100),
                idempotency_key: `adjustment-${tenantId}-${Date.now()}`,
                reason: adjustmentForm.reason
            }),
            'Adjustment requested. A different admin must approve it.'
        );
        setAdjustmentForm({ revenue_transaction_id: '', amount_pesos: '', reason: '' });
    };

    const reconcileStatement = () => {
        const rows = statementRows
            .split(/\r?\n/)
            .map((line) => line.trim())
            .filter(Boolean)
            .map((line) => {
                const [provider_payment_id, gross, fee, net, feeVat = ''] = line.split(',').map((value) => value.trim());
                return {
                    provider_payment_id,
                    gross_amount_centavos: Number(gross),
                    provider_fee_centavos: Number(fee),
                    provider_net_centavos: Number(net),
                    provider_fee_vat_centavos: feeVat === '' ? null : Number(feeVat)
                };
            });
        if (!rows.length || rows.some((row) => !row.provider_payment_id || !Number.isInteger(row.gross_amount_centavos) || !Number.isInteger(row.provider_fee_centavos) || !Number.isInteger(row.provider_net_centavos))) {
            toast.error('Each statement row must contain payment ID, gross centavos, fee centavos, and net centavos.');
            return;
        }
        runAction(
            'statement:reconcile',
            () => adminService.reconcileTenantRevenueProviderFinancials({
                ...(tenantId ? { tenant_id: tenantId } : {}),
                source: 'statement',
                statement_reference: statementReference,
                rows
            }),
            'Provider statement rows reconciled against the immutable ledger.'
        );
    };

    const downloadCsv = async () => {
        setActionLoading('csv');
        try {
            const response = await adminService.downloadTenantRevenueCsv(filters);
            const url = URL.createObjectURL(response.data);
            const link = document.createElement('a');
            link.href = url;
            link.download = `tenant-revenue-${periodStart}-${periodEnd}.csv`;
            link.click();
            URL.revokeObjectURL(url);
        } catch (downloadError) {
            toast.error(downloadError?.response?.data?.message || 'CSV export failed.');
        } finally {
            setActionLoading('');
        }
    };

    const tabs = [
        { id: 'overview', label: 'Overview', icon: WalletCards },
        { id: 'transactions', label: 'Transactions', icon: Banknote },
        { id: 'settlements', label: 'Settlements', icon: Landmark },
        { id: 'reconciliation', label: 'Reconciliation', icon: Scale },
        { id: 'configuration', label: 'Fee Configuration', icon: Settings2 }
    ];

    return (
        <section className="mb-6 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm" aria-labelledby="tenant-revenue-title">
            <header className="border-b border-slate-200 bg-slate-950 px-5 py-4 text-white">
                <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
                    <div>
                        <div className="text-xs font-semibold uppercase tracking-[0.16em] text-blue-300">Financial Operations</div>
                        <h2 id="tenant-revenue-title" className="mt-1 text-xl font-bold">Revenue & Settlement</h2>
                        <p className="mt-1 max-w-3xl text-sm text-slate-300">
                            DGFY collects supported online payments, records provider and platform fees, then settles the traceable tenant payable. PayMongo split payments are not used by this workflow.
                        </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                        <Button type="button" variant="outline" onClick={downloadCsv} disabled={actionLoading === 'csv'} className="border-slate-600 bg-transparent text-white hover:bg-slate-800 hover:text-white">
                            {actionLoading === 'csv' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
                            Export CSV
                        </Button>
                        <Button type="button" variant="outline" onClick={() => window.print()} className="border-slate-600 bg-transparent text-white hover:bg-slate-800 hover:text-white">
                            <Printer className="mr-2 h-4 w-4" />
                            Print / PDF
                        </Button>
                        <Button type="button" onClick={loadRevenue} disabled={loading} className="bg-blue-600 text-white hover:bg-blue-500">
                            <RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                            Refresh
                        </Button>
                    </div>
                </div>
            </header>

            <div className="border-b border-slate-200 bg-slate-50 p-4">
                <div className="grid grid-cols-1 gap-3 md:grid-cols-3 xl:grid-cols-5">
                    <label className="text-sm font-medium text-slate-700">
                        Tenant
                        <select value={tenantId} onChange={handleTenantChange} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm">
                            <option value="">All tenants (read-only summary)</option>
                            {tenants.map((tenant) => <option key={tenant.id} value={tenant.id}>{tenant.name}</option>)}
                        </select>
                    </label>
                    <label className="text-sm font-medium text-slate-700">
                        From
                        <input type="date" value={periodStart} onChange={(event) => setPeriodStart(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm" />
                    </label>
                    <label className="text-sm font-medium text-slate-700">
                        To
                        <input type="date" value={periodEnd} min={periodStart} onChange={(event) => setPeriodEnd(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm" />
                    </label>
                    <label className="text-sm font-medium text-slate-700">
                        Company
                        <input value={transactionFilters.company_id} onChange={(event) => setTransactionFilters((current) => ({ ...current, company_id: event.target.value }))} placeholder="Company ID" className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm" />
                    </label>
                    <label className="text-sm font-medium text-slate-700">
                        Branch
                        <input value={transactionFilters.branch_id} onChange={(event) => setTransactionFilters((current) => ({ ...current, branch_id: event.target.value }))} placeholder="Branch ID" className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm" />
                    </label>
                    <label className="text-sm font-medium text-slate-700">
                        Payment method
                        <select value={transactionFilters.payment_method} onChange={(event) => setTransactionFilters((current) => ({ ...current, payment_method: event.target.value }))} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm">
                            <option value="">All methods</option>
                            <option value="card">Cards</option>
                            <option value="ewallet">E-wallets</option>
                            <option value="qrph">QR Ph</option>
                            <option value="online_banking">Online banking</option>
                            <option value="other">Other</option>
                        </select>
                    </label>
                    <label className="text-sm font-medium text-slate-700">
                        Transaction status
                        <select value={transactionFilters.payment_status} onChange={(event) => setTransactionFilters((current) => ({ ...current, payment_status: event.target.value }))} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm">
                            <option value="">All statuses</option>
                            <option value="paid">Paid</option>
                            <option value="partially_refunded">Partially refunded</option>
                            <option value="refunded">Refunded</option>
                            <option value="chargeback">Chargeback</option>
                            <option value="reversed">Reversed</option>
                        </select>
                    </label>
                    <label className="text-sm font-medium text-slate-700">
                        Settlement status
                        <select value={transactionFilters.settlement_status} onChange={(event) => setTransactionFilters((current) => ({ ...current, settlement_status: event.target.value }))} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm">
                            <option value="">All statuses</option>
                            {['pending', 'eligible', 'scheduled', 'processing', 'partially_settled', 'settled', 'on_hold', 'reversed'].map((status) => <option key={status} value={status}>{status.replace(/_/g, ' ')}</option>)}
                        </select>
                    </label>
                    <label className="text-sm font-medium text-slate-700">
                        PayMongo reference
                        <input value={transactionFilters.provider_payment_id} onChange={(event) => setTransactionFilters((current) => ({ ...current, provider_payment_id: event.target.value }))} placeholder="pay_…" className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm" />
                    </label>
                    <label className="text-sm font-medium text-slate-700">
                        Settlement reference
                        <input value={transactionFilters.settlement_reference} onChange={(event) => setTransactionFilters((current) => ({ ...current, settlement_reference: event.target.value }))} placeholder="SET-…" className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm" />
                    </label>
                </div>
            </div>

            <nav className="flex gap-1 overflow-x-auto border-b border-slate-200 px-4 pt-3" aria-label="Revenue and settlement views">
                {tabs.map((tab) => {
                    const Icon = tab.icon;
                    return (
                        <button
                            key={tab.id}
                            type="button"
                            onClick={() => setActiveTab(tab.id)}
                            className={`flex shrink-0 items-center gap-2 border-b-2 px-3 py-2 text-sm font-semibold ${
                                activeTab === tab.id
                                    ? 'border-blue-600 text-blue-700'
                                    : 'border-transparent text-slate-500 hover:text-slate-800'
                            }`}
                        >
                            <Icon className="h-4 w-4" />
                            {tab.label}
                        </button>
                    );
                })}
            </nav>

            <div className="p-4">
                {error ? (
                    <div className="mb-4 flex items-start gap-3 rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">
                        <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
                        <div className="flex-1">
                            <strong>Revenue workspace unavailable.</strong>
                            <div>{error}</div>
                            {/Admin authentication required|expired|token/i.test(String(error || '')) ? (
                                <button
                                    type="button"
                                    onClick={() => {
                                        if (typeof window !== 'undefined') {
                                            window.location.href = '/admin';
                                        }
                                    }}
                                    className="mt-2.5 inline-flex items-center gap-1.5 rounded-lg bg-rose-700 px-3.5 py-1.5 text-xs font-bold text-white shadow-sm hover:bg-rose-800 transition-colors"
                                >
                                    Sign in as Platform Admin
                                </button>
                            ) : null}
                        </div>
                    </div>
                ) : null}
                {!dashboard.feature?.enabled ? (
                    <div className="mb-4 flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
                        <FileWarning className="mt-0.5 h-5 w-5 shrink-0" />
                        <div>
                            <strong>Safe rollout mode.</strong>
                            <div>Tenant revenue posting is disabled until TENANT_REVENUE_SHARING_ENABLED=true. Automatic payouts remain separately locked.</div>
                        </div>
                    </div>
                ) : null}

                {loading ? (
                    <div className="flex items-center justify-center gap-2 py-12 text-sm text-slate-500">
                        <Loader2 className="h-5 w-5 animate-spin" /> Loading financial records…
                    </div>
                ) : null}

                {!loading && activeTab === 'overview' ? (
                    <div className="space-y-4">
                        <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-5">
                            <SummaryCard label="Gross Sales" value={pesos(dashboard.totals?.gross_centavos)} tone="blue" />
                            <SummaryCard label="Successful Transactions" value={dashboard.counts?.successful_transactions || 0} tone="blue" />
                            <SummaryCard label="PayMongo Fees" value={pesos(dashboard.totals?.provider_fee_centavos)} />
                            <SummaryCard label="PayMongo Fee VAT" value={pesos(dashboard.totals?.provider_fee_vat_centavos)} />
                            <SummaryCard label="DGFY Earnings" value={pesos(dashboard.totals?.dgfy_fee_centavos)} tone="green" />
                            <SummaryCard label="Refunds" value={pesos(dashboard.totals?.refund_centavos)} tone="amber" />
                            <SummaryCard label="Chargebacks" value={pesos(dashboard.totals?.chargeback_centavos)} tone="amber" />
                            <SummaryCard label="Adjustments" value={pesos(dashboard.totals?.adjustment_centavos)} />
                            <SummaryCard label="Pending Settlement" value={pesos(dashboard.totals?.pending_centavos)} tone="amber" />
                            <SummaryCard label="Available for Settlement" value={pesos(dashboard.totals?.available_centavos)} tone="green" />
                            <SummaryCard label="Paid to Tenant" value={pesos(dashboard.totals?.settled_centavos)} tone="green" />
                            <SummaryCard label="Remaining Tenant Payable" value={pesos(dashboard.totals?.unsettled_centavos)} />
                            <SummaryCard label="Next Settlement Date" value={dateOnly(dashboard.schedule?.next_settlement_date)} />
                            <SummaryCard label="Last Settlement Date" value={dateOnly(dashboard.schedule?.last_settlement_date)} />
                            <SummaryCard label="Open Exceptions" value={dashboard.counts?.open_exceptions || 0} tone="amber" />
                        </div>
                        <div className="rounded-lg border border-slate-200 p-4">
                            <h3 className="font-semibold text-slate-900">Operational controls</h3>
                            <div className="mt-3 grid gap-3 text-sm md:grid-cols-3">
                                <div><span className="text-slate-500">Collection model:</span><div className="font-medium">DGFY collect, reconcile, settle</div></div>
                                <div><span className="text-slate-500">PayMongo split:</span><div className="font-medium">Not used</div></div>
                                <div><span className="text-slate-500">Automatic payouts:</span><div className="font-medium">{dashboard.feature?.automatic_payout_available ? 'Approved and available' : 'Locked'}</div></div>
                            </div>
                        </div>
                    </div>
                ) : null}

                {!loading && activeTab === 'transactions' ? (
                    <div className="space-y-4">
                        <div className="overflow-x-auto rounded-lg border border-slate-200">
                            <table className="min-w-full text-left text-sm">
                                <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                                    <tr>
                                        <th className="px-3 py-3">Paid</th>
                                        <th className="px-3 py-3">Tenant / Payment</th>
                                        <th className="px-3 py-3 text-right">Gross</th>
                                        <th className="px-3 py-3 text-right">PayMongo fee</th>
                                        <th className="px-3 py-3 text-right">DGFY fee</th>
                                        <th className="px-3 py-3 text-right">Tenant payable</th>
                                        <th className="px-3 py-3">Status</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {transactions.map((row) => (
                                        <tr key={row.revenue_transaction_id} onClick={() => setSelectedTransaction(row)} className="cursor-pointer hover:bg-blue-50/40">
                                            <td className="whitespace-nowrap px-3 py-3">{dateOnly(row.paid_at)}</td>
                                            <td className="px-3 py-3"><div className="font-medium text-slate-900">{row.tenant?.name || row.tenant_id}</div><div className="font-mono text-xs text-slate-500">{row.provider_payment_id}</div></td>
                                            <td className="px-3 py-3 text-right tabular-nums">{pesos(row.gross_amount_centavos)}</td>
                                            <td className="px-3 py-3 text-right tabular-nums">{row.provider_fee_centavos === null ? 'Review' : pesos(row.provider_fee_centavos)}</td>
                                            <td className="px-3 py-3 text-right tabular-nums">{pesos(row.dgfy_fee_centavos)}</td>
                                            <td className="px-3 py-3 text-right font-semibold tabular-nums">{pesos(row.tenant_net_payable_centavos)}</td>
                                            <td className="px-3 py-3"><div className="flex flex-col items-start gap-1"><StatusBadge value={row.reconciliation_status} /><StatusBadge value={row.settlement_status} /></div></td>
                                        </tr>
                                    ))}
                                    {!transactions.length ? <tr><td colSpan={7} className="px-4 py-10 text-center text-slate-500">No tenant revenue transactions match the filters.</td></tr> : null}
                                </tbody>
                            </table>
                        </div>
                        {selectedTransaction ? (
                            <div className="rounded-lg border border-blue-200 bg-blue-50/40 p-4">
                                <div className="flex items-center justify-between gap-3"><h3 className="font-semibold text-slate-900">Transaction calculation</h3><button type="button" onClick={() => setSelectedTransaction(null)} className="text-sm text-slate-500">Close</button></div>
                                <div className="mt-3 grid grid-cols-2 gap-3 text-sm md:grid-cols-4">
                                    <div>Gross Sale<div className="font-semibold tabular-nums">{pesos(selectedTransaction.gross_amount_centavos)}</div></div>
                                    <div>PayMongo Fee<div className="font-semibold tabular-nums">{selectedTransaction.provider_fee_centavos === null ? 'Manual review' : pesos(selectedTransaction.provider_fee_centavos)}</div></div>
                                    <div>DGFY Rate<div className="font-semibold tabular-nums">{(Number(selectedTransaction.dgfy_rate_bps || 0) / 100).toFixed(2)}%</div></div>
                                    <div>DGFY Fee<div className="font-semibold tabular-nums">{pesos(selectedTransaction.dgfy_fee_centavos)}</div></div>
                                    <div>Refunds<div className="font-semibold tabular-nums">{pesos(selectedTransaction.refund_centavos)}</div></div>
                                    <div>Chargebacks<div className="font-semibold tabular-nums">{pesos(selectedTransaction.chargeback_centavos)}</div></div>
                                    <div>Adjustments<div className="font-semibold tabular-nums">{pesos(selectedTransaction.adjustment_centavos)}</div></div>
                                    <div>Tenant Net Payable<div className="font-bold tabular-nums text-blue-800">{pesos(selectedTransaction.tenant_net_payable_centavos)}</div></div>
                                </div>
                            </div>
                        ) : null}
                    </div>
                ) : null}

                {!loading && activeTab === 'settlements' ? (
                    <div className="space-y-4">
                        <div className="flex flex-col gap-3 rounded-lg border border-slate-200 bg-slate-50 p-4 lg:flex-row lg:items-end lg:justify-between">
                            <div><h3 className="font-semibold text-slate-900">Prepare settlement batch</h3><p className="text-sm text-slate-500">Only reconciled and eligible transactions enter a batch. A different admin must approve it.</p></div>
                            <Button type="button" onClick={createBatch} disabled={!tenantId || actionLoading === 'batch:create'}>
                                {actionLoading === 'batch:create' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Landmark className="mr-2 h-4 w-4" />}
                                Prepare selected period
                            </Button>
                        </div>
                        <label className="block text-sm font-medium text-slate-700">Approval / cancellation reason
                            <input value={actionReason} onChange={(event) => setActionReason(event.target.value)} placeholder="Required for controlled financial actions" className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" />
                        </label>
                        <div className="space-y-3">
                            {batches.map((batch) => (
                                <article key={batch.settlement_batch_id} className="rounded-lg border border-slate-200 p-4">
                                    <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                                        <div><div className="font-mono text-sm font-semibold">{batch.batch_number}</div><div className="text-sm text-slate-500">{batch.tenant?.name || batch.tenant_id} · {dateOnly(batch.period_start)}–{dateOnly(batch.period_end)}</div></div>
                                        <StatusBadge value={batch.status} />
                                    </div>
                                    <div className="mt-3 grid grid-cols-2 gap-3 text-sm md:grid-cols-4">
                                        <div>Gross<div className="font-semibold tabular-nums">{pesos(batch.gross_centavos)}</div></div>
                                        <div>PayMongo Fees<div className="font-semibold tabular-nums">{pesos(batch.provider_fee_centavos)}</div></div>
                                        <div>DGFY Fees<div className="font-semibold tabular-nums">{pesos(batch.dgfy_fee_centavos)}</div></div>
                                        <div>Final Payout<div className="font-bold tabular-nums text-emerald-700">{pesos(batch.payout_centavos)}</div></div>
                                    </div>
                                    <div className="mt-3 flex flex-wrap gap-2">
                                        {batch.status === 'prepared' ? (
                                            <>
                                                <Button size="sm" onClick={() => runAction(`approve:${batch.settlement_batch_id}`, () => adminService.approveTenantSettlementBatch(batch.settlement_batch_id, { reason: actionReason }), 'Settlement batch approved.')} disabled={actionReason.trim().length < 3 || Boolean(actionLoading)}>
                                                    Approve
                                                </Button>
                                                <Button size="sm" variant="outline" onClick={() => runAction(`cancel:${batch.settlement_batch_id}`, () => adminService.cancelTenantSettlementBatch(batch.settlement_batch_id, { reason: actionReason }), 'Settlement batch cancelled and transactions released.')} disabled={actionReason.trim().length < 3 || Boolean(actionLoading)}>
                                                    Cancel
                                                </Button>
                                            </>
                                        ) : null}
                                        {batch.status === 'on_hold' ? (
                                            <Button size="sm" variant="outline" onClick={() => runAction(`cancel:${batch.settlement_batch_id}`, () => adminService.cancelTenantSettlementBatch(batch.settlement_batch_id, { reason: actionReason }), 'Held settlement batch cancelled; eligible items and carry-forward entries were released.')} disabled={actionReason.trim().length < 3 || Boolean(actionLoading)}>
                                                Cancel held batch
                                            </Button>
                                        ) : null}
                                        {batch.status === 'approved' ? (
                                            <>
                                                <input type="date" value={customPayoutDate} onChange={(event) => setCustomPayoutDate(event.target.value)} className="rounded-md border border-slate-300 px-2 py-1 text-sm" aria-label="Custom payout date" />
                                                <Button size="sm" variant="outline" onClick={() => runAction(`schedule:${batch.settlement_batch_id}`, () => adminService.scheduleTenantSettlementBatch(batch.settlement_batch_id, { scheduled_payout_at: `${customPayoutDate}T09:00:00.000Z`, reason: actionReason }), 'Custom settlement date recorded.')} disabled={actionReason.trim().length < 3 || Boolean(actionLoading)}>Schedule date</Button>
                                                <Button size="sm" onClick={() => runAction(`payout:${batch.settlement_batch_id}`, () => adminService.createTenantManualPayout(batch.settlement_batch_id, {
                                                    method: 'manual_bank',
                                                    idempotency_key: `manual-${batch.settlement_batch_id}-${Date.now()}`
                                                }), 'Manual payout record created. Confirm only after the transfer succeeds.')} disabled={Boolean(actionLoading)}>
                                                    Record manual payout
                                                </Button>
                                            </>
                                        ) : null}
                                        {batch.status === 'scheduled' ? <Button size="sm" onClick={() => runAction(`payout:${batch.settlement_batch_id}`, () => adminService.createTenantManualPayout(batch.settlement_batch_id, { method: 'manual_bank', idempotency_key: `manual-${batch.settlement_batch_id}-${Date.now()}` }), 'Manual payout record created.')} disabled={Boolean(actionLoading)}>Record scheduled payout</Button> : null}
                                    </div>
                                </article>
                            ))}
                            {!batches.length ? <div className="rounded-lg border border-dashed border-slate-300 p-10 text-center text-sm text-slate-500">No settlement batches yet.</div> : null}
                        </div>
                        {dashboard.recent_payouts?.length ? (
                            <div className="rounded-lg border border-slate-200 p-4">
                                <h3 className="font-semibold text-slate-900">Payout confirmation</h3>
                                <p className="text-sm text-slate-500">Enter bank/provider evidence only after the approved transfer has completed.</p>
                                <div className="mt-3 grid gap-3 md:grid-cols-2">
                                    <input value={providerReference} onChange={(event) => setProviderReference(event.target.value)} placeholder="Bank / PayMongo transfer reference" className="rounded-lg border border-slate-300 px-3 py-2 text-sm" />
                                    <input value={proofReference} onChange={(event) => setProofReference(event.target.value)} placeholder="Proof URL or controlled document reference" className="rounded-lg border border-slate-300 px-3 py-2 text-sm" />
                                </div>
                                <div className="mt-3 space-y-2">
                                    {dashboard.recent_payouts.map((payout) => (
                                        <div key={payout.payout_id} className="flex flex-col gap-2 rounded-lg bg-slate-50 p-3 sm:flex-row sm:items-center sm:justify-between">
                                            <div><div className="font-mono text-sm">{payout.public_reference}</div><div className="text-sm font-semibold tabular-nums">{pesos(payout.amount_centavos)}</div></div>
                                            <div className="flex flex-wrap items-center gap-2">
                                                <StatusBadge value={payout.status} />
                                                {!['paid', 'failed'].includes(payout.status) ? <Button size="sm" onClick={() => runAction(`confirm:${payout.payout_id}`, () => adminService.confirmTenantManualPayout(payout.payout_id, { provider_reference: providerReference, proof_reference: proofReference }), 'Payout confirmed and tenant payable ledger settled.')} disabled={providerReference.trim().length < 3 || proofReference.trim().length < 3 || Boolean(actionLoading)}>Confirm paid</Button> : null}
                                                {!['paid', 'failed'].includes(payout.status) ? <Button size="sm" variant="outline" onClick={() => runAction(`fail:${payout.payout_id}`, () => adminService.failTenantManualPayout(payout.payout_id, { reason: actionReason }), 'Payout marked failed. A controlled retry is now available.')} disabled={actionReason.trim().length < 3 || Boolean(actionLoading)}>Mark failed</Button> : null}
                                                {payout.status === 'failed' ? <Button size="sm" onClick={() => runAction(`retry:${payout.payout_id}`, () => adminService.retryTenantManualPayout(payout.payout_id, { reason: actionReason, idempotency_key: `retry-${payout.payout_id}-${Date.now()}` }), 'Approved payout retry record created.')} disabled={actionReason.trim().length < 3 || Boolean(actionLoading)}>Retry payout</Button> : null}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        ) : null}
                    </div>
                ) : null}

                {!loading && activeTab === 'reconciliation' ? (
                    <div className="space-y-4">
                        <div className="flex flex-col gap-3 rounded-lg border border-slate-200 bg-slate-50 p-4 sm:flex-row sm:items-center sm:justify-between">
                            <div><h3 className="font-semibold text-slate-900">Internal ledger and payout audit</h3><p className="text-sm text-slate-500">Checks payment, fee, refund, chargeback, settlement, and payout evidence without changing posted ledger entries.</p></div>
                            <Button type="button" variant="outline" onClick={() => runAction('reconciliation:internal', () => adminService.runTenantRevenueInternalReconciliation(filters), 'Internal financial reconciliation completed.')} disabled={Boolean(actionLoading)}><Scale className="mr-2 h-4 w-4" />Run internal audit</Button>
                        </div>
                        <div className="rounded-lg border border-blue-200 bg-blue-50/30 p-4">
                            <h3 className="font-semibold text-slate-900">PayMongo statement reconciliation</h3>
                            <p className="text-sm text-slate-500">Import authoritative provider values after webhook data. One line per payment: payment ID, gross centavos, fee centavos, net centavos, optional fee VAT centavos.</p>
                            <input value={statementReference} onChange={(event) => setStatementReference(event.target.value)} placeholder="PayMongo statement / export reference" className="mt-3 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
                            <textarea value={statementRows} onChange={(event) => setStatementRows(event.target.value)} rows={4} placeholder="pay_123,30000,800,29200,0" className="mt-3 w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-xs" />
                            <Button type="button" onClick={reconcileStatement} disabled={statementReference.trim().length < 3 || !statementRows.trim() || Boolean(actionLoading)}>Reconcile provider rows</Button>
                        </div>
                        <div className="rounded-lg border border-slate-200 p-4">
                            <h3 className="font-semibold text-slate-900">Manual adjustment request</h3>
                            <p className="text-sm text-slate-500">Positive values increase tenant payable; negative values decrease it. A different admin must approve and post the ledger entry.</p>
                            <div className="mt-3 grid gap-3 md:grid-cols-3">
                                <select value={adjustmentForm.revenue_transaction_id} onChange={(event) => setAdjustmentForm({ ...adjustmentForm, revenue_transaction_id: event.target.value })} className="rounded-lg border border-slate-300 px-3 py-2 text-sm">
                                    <option value="">Select transaction</option>
                                    {transactions.map((row) => <option key={row.revenue_transaction_id} value={row.revenue_transaction_id}>{row.provider_payment_id} · {pesos(row.tenant_net_payable_centavos)}</option>)}
                                </select>
                                <input type="number" step="0.01" value={adjustmentForm.amount_pesos} onChange={(event) => setAdjustmentForm({ ...adjustmentForm, amount_pesos: event.target.value })} placeholder="Adjustment PHP (+ / -)" className="rounded-lg border border-slate-300 px-3 py-2 text-sm tabular-nums" />
                                <input value={adjustmentForm.reason} onChange={(event) => setAdjustmentForm({ ...adjustmentForm, reason: event.target.value })} placeholder="Adjustment reason" className="rounded-lg border border-slate-300 px-3 py-2 text-sm" />
                            </div>
                            <Button type="button" className="mt-3" onClick={requestAdjustment} disabled={!adjustmentForm.revenue_transaction_id || !Number(adjustmentForm.amount_pesos) || adjustmentForm.reason.trim().length < 3 || Boolean(actionLoading)}>Request adjustment</Button>
                        </div>
                        {adjustments.filter((entry) => entry.status === 'pending').length ? (
                            <div className="rounded-lg border border-amber-200 bg-amber-50/50 p-4">
                                <h3 className="font-semibold text-slate-900">Pending adjustment approvals</h3>
                                <div className="mt-3 space-y-2">
                                    {adjustments.filter((entry) => entry.status === 'pending').map((entry) => (
                                        <div key={entry.adjustment_id} className="flex flex-col gap-2 rounded-lg border border-amber-200 bg-white p-3 md:flex-row md:items-center md:justify-between">
                                            <div><div className="font-semibold tabular-nums">{pesos(entry.amount_centavos)}</div><div className="text-sm text-slate-600">{entry.reason}</div><div className="text-xs text-slate-500">Requested by {entry.requested_by}</div></div>
                                            <Button size="sm" onClick={() => runAction(`adjustment:approve:${entry.adjustment_id}`, () => adminService.approveTenantRevenueAdjustment(entry.adjustment_id, { reason: actionReason }), 'Adjustment approved and posted to the immutable ledger.')} disabled={actionReason.trim().length < 3 || Boolean(actionLoading)}>Approve adjustment</Button>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        ) : null}
                        <label className="block text-sm font-medium text-slate-700">Resolution reason
                            <input value={actionReason} onChange={(event) => setActionReason(event.target.value)} placeholder="Explain evidence used to resolve or waive an exception" className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" />
                        </label>
                        {exceptions.map((record) => (
                            <article key={record.reconciliation_id} className="rounded-lg border border-rose-200 bg-rose-50/40 p-4">
                                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                                    <div><div className="font-semibold text-slate-900">{String(record.exception_type).replace(/_/g, ' ')}</div><div className="text-xs text-slate-500">{record.tenant?.name || record.tenant_id} · detected {dateTime(record.detected_at)}</div></div>
                                    <StatusBadge value={record.severity} />
                                </div>
                                <div className="mt-3 grid gap-3 text-xs md:grid-cols-2"><pre className="overflow-auto rounded bg-white p-2">{JSON.stringify(record.expected_value, null, 2)}</pre><pre className="overflow-auto rounded bg-white p-2">{JSON.stringify(record.actual_value, null, 2)}</pre></div>
                                <div className="mt-3 flex gap-2">
                                    <Button size="sm" onClick={() => runAction(`resolve:${record.reconciliation_id}`, () => adminService.resolveTenantRevenueReconciliation(record.reconciliation_id, { reason: actionReason, waive: false }), 'Reconciliation exception resolved.')} disabled={actionReason.trim().length < 3 || Boolean(actionLoading)}><CheckCircle2 className="mr-2 h-4 w-4" />Resolve</Button>
                                    <Button size="sm" variant="outline" onClick={() => runAction(`waive:${record.reconciliation_id}`, () => adminService.resolveTenantRevenueReconciliation(record.reconciliation_id, { reason: actionReason, waive: true }), 'Reconciliation exception waived with an audit record.')} disabled={actionReason.trim().length < 3 || Boolean(actionLoading)}>Authorized waiver</Button>
                                </div>
                            </article>
                        ))}
                        {!exceptions.length ? <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-8 text-center text-sm text-emerald-800"><CheckCircle2 className="mx-auto mb-2 h-6 w-6" />No open reconciliation exceptions for the selected scope.</div> : null}
                    </div>
                ) : null}

                {!loading && activeTab === 'configuration' ? (
                    <div className="grid gap-5 xl:grid-cols-[1.4fr_1fr]">
                        <form onSubmit={submitPolicy} className="rounded-lg border border-slate-200 p-4">
                            <h3 className="font-semibold text-slate-900">Create fee policy version</h3>
                            <p className="text-sm text-slate-500">Historical versions are never overwritten. Select one tenant first.</p>
                            <div className="mt-4 grid gap-3 md:grid-cols-2">
                                <label className="text-sm font-medium">DGFY transaction percentage<input type="number" min="0" max="100" step="0.01" value={policyForm.dgfy_percentage} onChange={(event) => setPolicyForm({ ...policyForm, dgfy_percentage: event.target.value })} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 tabular-nums" required /></label>
                                <label className="text-sm font-medium">Settlement cycle<select value={policyForm.settlement_cycle_days} onChange={(event) => setPolicyForm({ ...policyForm, settlement_cycle_days: event.target.value })} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"><option value="15">15 days</option><option value="30">30 days</option></select></label>
                                <label className="text-sm font-medium">Settlement status<select value={policyForm.settlement_status} onChange={(event) => setPolicyForm({ ...policyForm, settlement_status: event.target.value })} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"><option value="on_hold">On hold</option><option value="active">Active</option><option value="suspended">Suspended</option></select></label>
                                <label className="text-sm font-medium">Minimum payout (PHP)<input type="number" min="0" step="0.01" value={policyForm.minimum_payout_pesos} onChange={(event) => setPolicyForm({ ...policyForm, minimum_payout_pesos: event.target.value })} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 tabular-nums" /></label>
                                <label className="text-sm font-medium">PayMongo fee absorbed by<select value={policyForm.provider_fee_payer} onChange={(event) => setPolicyForm({ ...policyForm, provider_fee_payer: event.target.value })} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"><option value="tenant">Tenant</option><option value="dgfy">DGFY</option><option value="shared">Shared</option></select></label>
                                {policyForm.provider_fee_payer === 'shared' ? <label className="text-sm font-medium">Tenant share of provider fee (%)<input type="number" min="0" max="100" step="0.01" value={policyForm.shared_fee_percentage} onChange={(event) => setPolicyForm({ ...policyForm, shared_fee_percentage: event.target.value })} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 tabular-nums" /></label> : null}
                                <label className="text-sm font-medium">Fallback payment method<select value={policyForm.fallback_method} onChange={(event) => setPolicyForm({ ...policyForm, fallback_method: event.target.value })} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"><option value="card">Cards</option><option value="ewallet">E-wallets</option><option value="qrph">QR Ph</option><option value="online_banking">Online banking</option><option value="other">Other</option></select></label>
                                <label className="text-sm font-medium">Fallback rate (%)<input type="number" min="0" max="100" step="0.01" value={policyForm.fallback_rate_percentage} onChange={(event) => setPolicyForm({ ...policyForm, fallback_rate_percentage: event.target.value })} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 tabular-nums" placeholder="Optional" /></label>
                                <label className="text-sm font-medium">Fallback fixed fee (PHP)<input type="number" min="0" step="0.01" value={policyForm.fallback_fixed_pesos} onChange={(event) => setPolicyForm({ ...policyForm, fallback_fixed_pesos: event.target.value })} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 tabular-nums" placeholder="Optional" /></label>
                                <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">Fallbacks are method-specific and used only when PayMongo has not supplied an actual or reconciled fee. Transactions remain under review until gross, fee, and net reconcile.</div>
                                <label className="text-sm font-medium">Effective date<input type="date" value={policyForm.effective_at} onChange={(event) => setPolicyForm({ ...policyForm, effective_at: event.target.value })} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" required /></label>
                                <label className="text-sm font-medium">Payout type<select value={policyForm.payout_type} onChange={(event) => setPolicyForm({ ...policyForm, payout_type: event.target.value })} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"><option value="bank">Bank</option><option value="paymongo">PayMongo</option><option value="wallet">Wallet</option></select></label>
                                <label className="text-sm font-medium">Bank / payout provider<input value={policyForm.payout_provider} onChange={(event) => setPolicyForm({ ...policyForm, payout_provider: event.target.value })} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" placeholder="BDO, BPI, PayMongo…" /></label>
                                <label className="text-sm font-medium">Account name<input value={policyForm.payout_account_name} onChange={(event) => setPolicyForm({ ...policyForm, payout_account_name: event.target.value })} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" /></label>
                                <label className="text-sm font-medium">Account number<input value={policyForm.payout_account_number} onChange={(event) => setPolicyForm({ ...policyForm, payout_account_number: event.target.value })} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" autoComplete="off" /></label>
                                <label className="text-sm font-medium md:col-span-2">Change reason<textarea value={policyForm.reason} onChange={(event) => setPolicyForm({ ...policyForm, reason: event.target.value })} minLength={3} maxLength={500} rows={3} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" required /></label>
                            </div>
                            <div className="mt-4 flex items-center justify-between gap-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900"><span>Automatic payout is locked pending external approval.</span><input type="checkbox" disabled aria-label="Automatic payout disabled" /></div>
                            <Button type="submit" className="mt-4" disabled={!tenantId || actionLoading === 'policy'}>{actionLoading === 'policy' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}Create policy version</Button>
                        </form>
                        <div className="rounded-lg border border-slate-200 p-4">
                            <h3 className="font-semibold text-slate-900">Fee configuration history</h3>
                            <p className="text-sm text-slate-500">{tenantId ? `${policies.length} immutable version(s)` : 'Select one tenant to view history.'}</p>
                            <div className="mt-4 space-y-3">
                                {policies.map((policy) => (
                                    <article key={policy.policy_id} className={`rounded-lg border p-3 ${policy.policy_id === latestPolicy?.policy_id ? 'border-blue-200 bg-blue-50/50' : 'border-slate-200'}`}>
                                        <div className="flex items-center justify-between gap-2">
                                            <strong>Version {policy.version}{policy.policy_id === latestPolicy?.policy_id ? ' · Latest saved' : ''}</strong>
                                            <StatusBadge value={policy.settlement_status} />
                                        </div>
                                        <div className="mt-2 text-sm text-slate-700"><div>DGFY: <strong>{(Number(policy.dgfy_rate_bps) / 100).toFixed(2)}%</strong></div><div>Cycle: {policy.settlement_cycle_days} days</div><div>Provider fee: {policy.provider_fee_payer}</div><div>Fallbacks: {policy.fallback_fee_policy ? Object.keys(policy.fallback_fee_policy).join(', ') : 'None'}</div><div>Destination: {policy.payout_destination_masked || 'Not configured'}</div><div>Effective: {dateTime(policy.effective_at)}</div></div>
                                        <p className="mt-2 text-xs text-slate-500">{policy.reason}</p>
                                    </article>
                                ))}
                                {tenantId && !policies.length ? <div className="rounded-lg border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">No fee policy exists. Create one before enabling online collection.</div> : null}
                            </div>
                        </div>
                    </div>
                ) : null}
            </div>
        </section>
    );
}
