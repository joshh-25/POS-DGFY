import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, CreditCard, Download, RefreshCw, RotateCcw, Search, ShieldCheck, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import ConfirmActionDialog from '@/components/ui/ConfirmActionDialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import * as adminService from '@/services/adminService';
import { toast } from 'sonner';

const money = (centavos) => `PHP ${((Number(centavos || 0)) / 100).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const statusClass = (status) => {
  const normalized = String(status || '').toLowerCase();
  if (['finalized', 'paid', 'succeeded', 'active'].includes(normalized)) return 'border-emerald-200 bg-emerald-50 text-emerald-700';
  if (['awaiting_payment', 'pending', 'created', 'refund_pending'].includes(normalized)) return 'border-amber-200 bg-amber-50 text-amber-700';
  if (['failed', 'expired', 'restricted'].includes(normalized)) return 'border-rose-200 bg-rose-50 text-rose-700';
  return 'border-slate-200 bg-slate-50 text-slate-700';
};

const getRefundableCentavos = (session) => Number(session?.refundable_amount_centavos || 0);
const canRefundSession = (session) => Boolean(session?.provider_payment_id) && getRefundableCentavos(session) > 0
  && ['finalized', 'paid', 'partial_refunded', 'split_failed_manual_settlement_required'].includes(String(session?.status || ''));

const csvEscape = (value) => `"${String(value ?? '').replace(/"/g, '""')}"`;
const downloadCsv = (rows) => {
  const headers = [
    'payment_session_id',
    'tenant_id',
    'store_slug',
    'status',
    'total_amount_centavos',
    'platform_fee_centavos',
    'estimated_tenant_gross_centavos',
    'succeeded_refund_centavos',
    'pending_refund_centavos',
    'reconciliation_variance_centavos',
    'provider_payment_id',
    'tracking_pin'
  ];
  const body = rows.map((row) => headers.map((header) => csvEscape(row[header])).join(',')).join('\n');
  const blob = new Blob([[headers.join(','), body].filter(Boolean).join('\n')], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `paymongo-settlement-${new Date().toISOString().slice(0, 10)}.csv`;
  anchor.click();
  URL.revokeObjectURL(url);
};

export default function PaymentOperations() {
  const [loading, setLoading] = useState(false);
  const [savingAccount, setSavingAccount] = useState(false);
  const [creatingChildAccount, setCreatingChildAccount] = useState(false);
  const [submittingRefund, setSubmittingRefund] = useState(false);
  const [refundConfirmation, setRefundConfirmation] = useState(null);
  const [retryingReference, setRetryingReference] = useState('');
  const [providerAction, setProviderAction] = useState('');
  const [sessions, setSessions] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [tenants, setTenants] = useState([]);
  const [settlementReport, setSettlementReport] = useState(null);
  const [certification, setCertification] = useState(null);
  const [onboardingUrl, setOnboardingUrl] = useState('');
  const [expandedSession, setExpandedSession] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [accountForm, setAccountForm] = useState({
    tenant_id: '',
    provider_merchant_id: '',
    child_trade_name: '',
    provider_wallet_id: '',
    wallet_status: 'unknown',
    wallet_verified_at: new Date().toISOString().slice(0, 10),
    onboarding_status: 'pending',
    qrph_enabled: false,
    split_enabled: false,
    charges_enabled: false,
    verification_reference: '',
    verified_at: new Date().toISOString().slice(0, 10),
    verified_by: ''
  });
  const [refundForm, setRefundForm] = useState({
    payment_session_id: '',
    amount: '',
    refund_strategy: 'proportional',
    reason: 'requested_by_customer',
    notes: ''
  });

  const accountByTenant = useMemo(() => new Map(accounts.map((account) => [String(account.tenant_id), account])), [accounts]);
  const settlementSummary = settlementReport?.summary || {};
  const settlementRows = settlementReport?.rows || [];
  const selectedRefundSession = useMemo(() => {
    const reference = String(refundForm.payment_session_id || '').trim().toUpperCase();
    return sessions.find((session) => session.public_reference === reference) || null;
  }, [refundForm.payment_session_id, sessions]);
  const requestedRefundCentavos = Math.round(Number(refundForm.amount || 0) * 100);
  const refundAmountInvalid = requestedRefundCentavos <= 0
    || (selectedRefundSession && requestedRefundCentavos > getRefundableCentavos(selectedRefundSession));
  const refundSubmitDisabled = submittingRefund
    || !refundForm.payment_session_id
    || refundAmountInvalid
    || (selectedRefundSession && !canRefundSession(selectedRefundSession));

  const loadData = async () => {
    setLoading(true);
    try {
      const filters = statusFilter ? { status: statusFilter } : {};
      const [sessionResponse, accountResponse, settlementResponse, certificationResponse, tenantResponse] = await Promise.all([
        adminService.listCommercePaymentSessions(filters),
        adminService.listTenantPaymentAccounts(),
        adminService.getCommerceSettlementReport(filters),
        adminService.getPayMongoSandboxCertification(),
        adminService.getTenants('all')
      ]);
      setSessions(sessionResponse.data?.payment_sessions || []);
      setAccounts(accountResponse.data?.payment_accounts || []);
      setSettlementReport(settlementResponse.data?.settlement_report || null);
      setCertification(certificationResponse.data?.certification || null);
      setTenants(tenantResponse.data || []);
    } catch (error) {
      toast.error(error.response?.data?.message || error.message || 'Failed to load payment operations.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const saveAccount = async (event) => {
    event.preventDefault();
    if (accountForm.onboarding_status === 'active' && !accountForm.qrph_enabled) {
      toast.error('Active readiness requires QR Ph to be enabled. Split and charge readiness still require separate wallet/capability evidence.');
      return;
    }
    if ((accountForm.split_enabled || accountForm.charges_enabled) && accountForm.wallet_status !== 'enabled') {
      toast.error('Split and charge readiness require an enabled PayMongo wallet.');
      return;
    }
    if ((accountForm.split_enabled || accountForm.charges_enabled) && !accountForm.wallet_verified_at) {
      toast.error('Split and charge readiness require a wallet verification date.');
      return;
    }
    setSavingAccount(true);
    try {
      await adminService.upsertTenantPaymentAccount(accountForm.tenant_id, {
        provider_merchant_id: accountForm.provider_merchant_id,
        provider_wallet_id: accountForm.provider_wallet_id || null,
        wallet_status: accountForm.wallet_status,
        wallet_verified_at: accountForm.wallet_verified_at,
        onboarding_status: accountForm.onboarding_status,
        qrph_enabled: accountForm.qrph_enabled,
        split_enabled: accountForm.split_enabled,
        charges_enabled: accountForm.charges_enabled,
        verification_reference: accountForm.verification_reference,
        verified_at: accountForm.verified_at,
        verified_by: accountForm.verified_by
      });
      toast.success('Tenant PayMongo readiness saved.');
      await loadData();
    } catch (error) {
      toast.error(error.response?.data?.message || error.message || 'Failed to save tenant payment account.');
    } finally {
      setSavingAccount(false);
    }
  };

  const createChildAccount = async () => {
    if (!accountForm.tenant_id) {
      toast.error('Tenant ID is required before creating a PayMongo child account.');
      return;
    }
    const existing = accountByTenant.get(String(accountForm.tenant_id));
    if (existing?.provider_merchant_id) {
      toast.info('This tenant already has a PayMongo child merchant ID on record.');
      return;
    }
    setCreatingChildAccount(true);
    try {
      const response = await adminService.createTenantPayMongoChildAccount(accountForm.tenant_id, {
        trade_name: accountForm.child_trade_name || undefined
      });
      const paymentAccount = response.data?.payment_account;
      const childAccount = response.data?.paymongo_child_account;
      const returnedOnboardingUrl = childAccount?.onboarding_url || paymentAccount?.metadata?.onboarding_url || '';
      setOnboardingUrl(returnedOnboardingUrl);
      setAccountForm((form) => ({
        ...form,
        provider_merchant_id: paymentAccount?.provider_merchant_id || childAccount?.id || form.provider_merchant_id,
        provider_wallet_id: paymentAccount?.provider_wallet_id || form.provider_wallet_id,
        wallet_status: paymentAccount?.wallet_status || form.wallet_status,
        onboarding_status: paymentAccount?.onboarding_status || form.onboarding_status,
        qrph_enabled: Boolean(paymentAccount?.qrph_enabled),
        split_enabled: Boolean(paymentAccount?.split_enabled),
        charges_enabled: Boolean(paymentAccount?.charges_enabled),
        verification_reference: paymentAccount?.metadata?.verification_reference || form.verification_reference,
        verified_at: paymentAccount?.metadata?.verified_at || form.verified_at,
        verified_by: paymentAccount?.metadata?.verified_by || form.verified_by
      }));
      toast.success(childAccount?.onboarding_url
        ? 'PayMongo child account created. Continue onboarding from the returned PayMongo link.'
        : 'PayMongo child account created and saved as pending readiness.');
      await loadData();
    } catch (error) {
      toast.error(error.response?.data?.message || error.message || 'Failed to create PayMongo child account.');
    } finally {
      setCreatingChildAccount(false);
    }
  };

  const operateChildAccount = async (action) => {
    if (!accountForm.tenant_id) {
      toast.error('Tenant ID is required before using PayMongo child account actions.');
      return;
    }
    setProviderAction(action);
    try {
      const response = await adminService.operateTenantPayMongoChildAccount(accountForm.tenant_id, action);
      const paymentAccount = response.data?.payment_account;
      setAccountForm((form) => ({
        ...form,
        provider_merchant_id: paymentAccount?.provider_merchant_id || form.provider_merchant_id,
        provider_wallet_id: paymentAccount?.provider_wallet_id || form.provider_wallet_id,
        wallet_status: paymentAccount?.wallet_status || form.wallet_status,
        wallet_verified_at: paymentAccount?.wallet_verified_at ? String(paymentAccount.wallet_verified_at).slice(0, 10) : form.wallet_verified_at,
        onboarding_status: paymentAccount?.onboarding_status || form.onboarding_status,
        qrph_enabled: Boolean(paymentAccount?.qrph_enabled),
        split_enabled: Boolean(paymentAccount?.split_enabled),
        charges_enabled: Boolean(paymentAccount?.charges_enabled),
        verification_reference: paymentAccount?.metadata?.verification_reference || form.verification_reference,
        verified_at: paymentAccount?.metadata?.verified_at ? String(paymentAccount.metadata.verified_at).slice(0, 10) : form.verified_at,
        verified_by: paymentAccount?.metadata?.verified_by || form.verified_by
      }));
      const result = response.data?.provider_action;
      toast.success(`${action.replace('-', ' ')} completed. Wallet evidence: ${result?.wallet_evidence_detected ? 'yes' : 'no'}, split evidence: ${result?.split_evidence_detected ? 'yes' : 'no'}.`);
      await loadData();
    } catch (error) {
      toast.error(error.response?.data?.message || error.message || `Failed to run ${action}.`);
    } finally {
      setProviderAction('');
    }
  };

  const selectTenant = (tenantId) => {
    const tenant = tenants.find((entry) => String(entry.id) === String(tenantId));
    const account = accountByTenant.get(String(tenantId));
    setOnboardingUrl(account?.metadata?.onboarding_url || '');
    setAccountForm((form) => ({
      ...form,
      tenant_id: tenantId,
      child_trade_name: tenant?.name || form.child_trade_name,
      provider_merchant_id: account?.provider_merchant_id || '',
      provider_wallet_id: account?.provider_wallet_id || '',
      wallet_status: account?.wallet_status || 'unknown',
      wallet_verified_at: account?.wallet_verified_at ? String(account.wallet_verified_at).slice(0, 10) : form.wallet_verified_at,
      onboarding_status: account?.onboarding_status || 'pending',
      qrph_enabled: Boolean(account?.qrph_enabled),
      split_enabled: Boolean(account?.split_enabled),
      charges_enabled: Boolean(account?.charges_enabled),
      verification_reference: account?.metadata?.verification_reference || '',
      verified_at: account?.metadata?.verified_at ? String(account.metadata.verified_at).slice(0, 10) : form.verified_at,
      verified_by: account?.metadata?.verified_by || ''
    }));
  };

  const refundSession = async (event) => {
    event.preventDefault();
    const sessionLabel = selectedRefundSession
      ? `${selectedRefundSession.public_reference} (${money(selectedRefundSession.refundable_amount_centavos)} refundable)`
      : refundForm.payment_session_id;
    setRefundConfirmation({ sessionLabel, amountCentavos: requestedRefundCentavos });
  };

  const submitConfirmedRefund = async () => {
    setSubmittingRefund(true);
    try {
      await adminService.createCommercePaymentRefund(refundForm.payment_session_id, {
        amount: Number(refundForm.amount),
        refund_strategy: refundForm.refund_strategy,
        reason: refundForm.reason,
        notes: refundForm.notes
      });
      toast.success('Refund submitted to PayMongo. Session status stays pending until provider reconciliation completes.');
      await loadData();
      return true;
    } catch (error) {
      const message = error.response?.data?.message || error.message || 'Failed to create refund.';
      toast.error(message);
      return { success: false, message };
    } finally {
      setSubmittingRefund(false);
    }
  };

  const retryFinalization = async (reference) => {
    setRetryingReference(reference);
    try {
      await adminService.retryCommercePaymentFinalization(reference);
      toast.success('Finalization retry completed.');
      await loadData();
    } catch (error) {
      toast.error(error.response?.data?.message || error.message || 'Failed to retry finalization.');
    } finally {
      setRetryingReference('');
    }
  };

  const certificationChecks = certification?.checks || [];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <CreditCard className="w-6 h-6" />
            PayMongo Commerce Payments
          </h1>
          <p className="text-sm text-slate-600 mt-1">Reconcile QR Ph sessions, DGFY 1% split settlement, refunds, certification checks, and tenant readiness.</p>
        </div>
        <Button onClick={loadData} disabled={loading} variant="outline">
          <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      <div className="grid gap-3 md:grid-cols-4">
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="text-xs uppercase tracking-wide text-slate-500">Gross QR Ph</div>
          <div className="mt-1 text-xl font-bold text-slate-900">{money(settlementSummary.total_amount_centavos)}</div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="text-xs uppercase tracking-wide text-slate-500">DGFY Fixed 1%</div>
          <div className="mt-1 text-xl font-bold text-emerald-700">{money(settlementSummary.platform_fee_centavos)}</div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="text-xs uppercase tracking-wide text-slate-500">Tenant Gross Estimate</div>
          <div className="mt-1 text-xl font-bold text-slate-900">{money(settlementSummary.estimated_tenant_gross_centavos)}</div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="text-xs uppercase tracking-wide text-slate-500">Refund Exposure</div>
          <div className="mt-1 text-xl font-bold text-amber-700">{money(Number(settlementSummary.succeeded_refund_centavos || 0) + Number(settlementSummary.pending_refund_centavos || 0))}</div>
        </div>
      </div>

      <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 flex gap-3">
        <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" />
        <div>
          <div className="font-semibold">Operator safety notice</div>
          <p className="mt-1">Use this panel only with verified PayMongo child-merchant IDs and sandbox/live credentials. Pending refunds reserve balance but do not become completed refunds until provider reconciliation succeeds.</p>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="font-semibold text-slate-900">Sandbox Certification</h2>
              <p className="text-xs text-slate-500">Credential and contract checks before live money movement.</p>
            </div>
            <span className={`rounded-full border px-2 py-1 text-xs ${certification?.certified ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-amber-200 bg-amber-50 text-amber-700'}`}>
              {certification?.certified ? 'Config pass' : 'Needs evidence'}
            </span>
          </div>
          <div className="space-y-2">
            {certificationChecks.map((check) => (
              <div key={check.key} className="flex items-start gap-2 text-xs">
                {check.passed ? <CheckCircle2 className="mt-0.5 h-4 w-4 text-emerald-600" /> : <XCircle className={`mt-0.5 h-4 w-4 ${check.severity === 'warning' ? 'text-amber-600' : 'text-rose-600'}`} />}
                <div>
                  <div className="font-medium text-slate-800">{check.label}</div>
                  {check.details && <div className="mt-0.5 text-slate-500">{typeof check.details === 'string' ? check.details : JSON.stringify(check.details)}</div>}
                </div>
              </div>
            ))}
          </div>
        </section>

        <form onSubmit={saveAccount} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm space-y-4">
          <div>
            <h2 className="font-semibold text-slate-900 flex items-center gap-2"><ShieldCheck className="w-4 h-4" /> Tenant Readiness</h2>
            <p className="text-xs text-slate-500">Set active only from PayMongo-verified child merchant evidence.</p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label>Tenant</Label>
              <select className="w-full h-10 rounded-md border border-slate-300 px-3 text-sm" value={accountForm.tenant_id} onChange={(event) => selectTenant(event.target.value)}>
                <option value="">Select tenant</option>
                {tenants.map((tenant) => (
                  <option key={tenant.id} value={tenant.id}>{tenant.name} ({tenant.status})</option>
                ))}
              </select>
            </div>
            <div>
              <Label>Tenant ID</Label>
              <Input value={accountForm.tenant_id} onChange={(event) => setAccountForm((form) => ({ ...form, tenant_id: event.target.value }))} required />
            </div>
            <div>
              <Label>Child Account Trade Name</Label>
              <Input value={accountForm.child_trade_name} onChange={(event) => setAccountForm((form) => ({ ...form, child_trade_name: event.target.value }))} placeholder="Defaults to tenant company name" />
            </div>
            <div>
              <Label>Merchant ID</Label>
              <Input value={accountForm.provider_merchant_id} onChange={(event) => setAccountForm((form) => ({ ...form, provider_merchant_id: event.target.value }))} placeholder="org_child..." required />
            </div>
            <div>
              <Label>Wallet ID</Label>
              <Input value={accountForm.provider_wallet_id} onChange={(event) => setAccountForm((form) => ({ ...form, provider_wallet_id: event.target.value }))} />
            </div>
            <div>
              <Label>Wallet Status</Label>
              <select className="w-full h-10 rounded-md border border-slate-300 px-3 text-sm" value={accountForm.wallet_status} onChange={(event) => setAccountForm((form) => ({ ...form, wallet_status: event.target.value }))}>
                <option value="unknown">Unknown</option>
                <option value="closed_loop">Closed-loop</option>
                <option value="enabled">Enabled</option>
                <option value="restricted">Restricted</option>
              </select>
            </div>
            <div>
              <Label>Wallet Verified At</Label>
              <Input type="date" value={accountForm.wallet_verified_at} onChange={(event) => setAccountForm((form) => ({ ...form, wallet_verified_at: event.target.value }))} />
            </div>
            <div>
              <Label>Status</Label>
              <select className="w-full h-10 rounded-md border border-slate-300 px-3 text-sm" value={accountForm.onboarding_status} onChange={(event) => setAccountForm((form) => ({ ...form, onboarding_status: event.target.value }))}>
                <option value="pending">Pending</option>
                <option value="active">Active</option>
                <option value="restricted">Restricted</option>
                <option value="not_started">Not started</option>
              </select>
            </div>
            <div>
              <Label>Verification Reference</Label>
              <Input value={accountForm.verification_reference} onChange={(event) => setAccountForm((form) => ({ ...form, verification_reference: event.target.value }))} placeholder="PayMongo ticket/dashboard evidence" />
            </div>
            <div>
              <Label>Verified At</Label>
              <Input type="date" value={accountForm.verified_at} onChange={(event) => setAccountForm((form) => ({ ...form, verified_at: event.target.value }))} />
            </div>
            <div>
              <Label>Verified By</Label>
              <Input value={accountForm.verified_by} onChange={(event) => setAccountForm((form) => ({ ...form, verified_by: event.target.value }))} placeholder="operator name" />
            </div>
          </div>
          <div className="flex flex-wrap gap-3 text-sm">
            {['qrph_enabled', 'split_enabled', 'charges_enabled'].map((key) => (
              <label key={key} className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2">
                <input type="checkbox" checked={accountForm[key]} onChange={(event) => setAccountForm((form) => ({ ...form, [key]: event.target.checked }))} />
                {key.replace('_enabled', '').toUpperCase()}
              </label>
            ))}
          </div>
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600">
            <strong>Fee contract:</strong> DGFY 1% is based on item subtotal and charged to the customer as an added platform fee. PayMongo/provider processing and payout fees are shouldered by the tenant company and reduce company net settlement unless the provider contract changes.
          </div>
          {onboardingUrl && (
            <div className="rounded-lg border border-sky-200 bg-sky-50 p-3 text-xs text-sky-900">
              <div className="font-semibold">PayMongo onboarding link</div>
              <a className="mt-1 block break-all underline" href={onboardingUrl} target="_blank" rel="noreferrer">{onboardingUrl}</a>
              <Button type="button" size="sm" variant="outline" className="mt-2" onClick={() => navigator.clipboard?.writeText(onboardingUrl)}>
                Copy onboarding link
              </Button>
            </div>
          )}
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" onClick={createChildAccount} disabled={creatingChildAccount || !accountForm.tenant_id || Boolean(accountByTenant.get(String(accountForm.tenant_id))?.provider_merchant_id)}>
              {creatingChildAccount ? 'Creating child...' : 'Create PayMongo child'}
            </Button>
            <Button type="button" variant="outline" onClick={() => operateChildAccount('sync-requirements')} disabled={Boolean(providerAction) || !accountForm.provider_merchant_id}>
              {providerAction === 'sync-requirements' ? 'Syncing...' : 'Sync requirements'}
            </Button>
            <Button type="button" variant="outline" onClick={() => operateChildAccount('submit-review')} disabled={Boolean(providerAction) || !accountForm.provider_merchant_id}>
              {providerAction === 'submit-review' ? 'Submitting...' : 'Submit review'}
            </Button>
            <Button type="button" variant="outline" onClick={() => operateChildAccount('activate')} disabled={Boolean(providerAction) || !accountForm.provider_merchant_id}>
              {providerAction === 'activate' ? 'Activating...' : 'Activate account'}
            </Button>
            <Button type="submit" disabled={savingAccount}>{savingAccount ? 'Saving...' : 'Save readiness'}</Button>
          </div>
        </form>

        <form onSubmit={refundSession} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm space-y-4">
          <div>
            <h2 className="font-semibold text-slate-900 flex items-center gap-2"><RotateCcw className="w-4 h-4" /> Refund / Split Reversal</h2>
            <p className="text-xs text-slate-500">Refunds are provider-reconciled; pending refunds do not mark orders as refunded.</p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label>Payment Session</Label>
              <Input value={refundForm.payment_session_id} onChange={(event) => setRefundForm((form) => ({ ...form, payment_session_id: event.target.value.toUpperCase() }))} placeholder="CPS-..." required />
            </div>
            <div>
              <Label>Amount</Label>
              <Input type="number" step="0.01" min="0.01" value={refundForm.amount} onChange={(event) => setRefundForm((form) => ({ ...form, amount: event.target.value }))} required />
            </div>
            <div>
              <Label>Strategy</Label>
              <select className="w-full h-10 rounded-md border border-slate-300 px-3 text-sm" value={refundForm.refund_strategy} onChange={(event) => setRefundForm((form) => ({ ...form, refund_strategy: event.target.value }))}>
                <option value="proportional">Proportional default</option>
                <option value="tenant">Tenant shoulders</option>
                <option value="dgfy">DGFY shoulders</option>
              </select>
            </div>
            <div>
              <Label>Reason</Label>
              <select className="w-full h-10 rounded-md border border-slate-300 px-3 text-sm" value={refundForm.reason} onChange={(event) => setRefundForm((form) => ({ ...form, reason: event.target.value }))}>
                <option value="requested_by_customer">Requested by customer</option>
                <option value="duplicate">Duplicate</option>
                <option value="fraudulent">Fraudulent</option>
                <option value="others">Others</option>
              </select>
            </div>
          </div>
          {selectedRefundSession && (
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600">
              <div><strong>Status:</strong> {selectedRefundSession.status}</div>
              <div><strong>Refundable:</strong> {money(selectedRefundSession.refundable_amount_centavos)}</div>
              <div><strong>Provider payment:</strong> {selectedRefundSession.provider_payment_id || 'missing'}</div>
            </div>
          )}
          <div>
            <Label>Notes</Label>
            <Input maxLength={255} value={refundForm.notes} onChange={(event) => setRefundForm((form) => ({ ...form, notes: event.target.value }))} />
          </div>
          <Button type="submit" variant="destructive" disabled={refundSubmitDisabled}>{submittingRefund ? 'Submitting...' : 'Submit refund'}</Button>
        </form>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <div>
            <h2 className="font-semibold text-slate-900">Payment Sessions</h2>
            <p className="text-xs text-slate-500">Expandable reconciliation table with provider IDs, refund history, and settlement export.</p>
          </div>
          <div className="flex items-center gap-2">
            <Search className="w-4 h-4 text-slate-400" />
            <Input placeholder="status filter" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} className="w-48" />
            <Button variant="outline" onClick={loadData}>Apply</Button>
            <Button variant="outline" onClick={() => downloadCsv(settlementRows)} disabled={settlementRows.length === 0}>
              <Download className="w-4 h-4 mr-2" />
              Export
            </Button>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="text-left text-xs uppercase text-slate-500">
              <tr>
                <th className="py-2 pr-4">Reference</th>
                <th className="py-2 pr-4">Tenant</th>
                <th className="py-2 pr-4">Status</th>
                <th className="py-2 pr-4">Total</th>
                <th className="py-2 pr-4">DGFY 1%</th>
                <th className="py-2 pr-4">Refundable</th>
                <th className="py-2 pr-4">Order</th>
                <th className="py-2 pr-4">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {sessions.map((session) => {
                const isExpanded = expandedSession === session.public_reference;
                return (
                  <React.Fragment key={session.public_reference}>
                    <tr>
                      <td className="py-3 pr-4 font-mono text-xs">{session.public_reference}</td>
                      <td className="py-3 pr-4">
                        <div>{session.tenant_id}</div>
                        <div className={`inline-flex rounded-full border px-2 py-0.5 text-xs ${statusClass(accountByTenant.get(String(session.tenant_id))?.onboarding_status)}`}>
                          {accountByTenant.get(String(session.tenant_id))?.onboarding_status || 'no account'}
                        </div>
                        {accountByTenant.get(String(session.tenant_id)) && (
                          <div className="mt-1 text-[11px] text-slate-500">
                            Wallet: {accountByTenant.get(String(session.tenant_id))?.wallet_status || 'unknown'}
                          </div>
                        )}
                        {accountByTenant.get(String(session.tenant_id))?.metadata?.verification_reference && (
                          <div className="mt-1 text-[11px] text-slate-500">
                            Evidence: {accountByTenant.get(String(session.tenant_id))?.metadata?.verification_reference}
                          </div>
                        )}
                      </td>
                      <td className="py-3 pr-4"><span className={`rounded-full border px-2 py-1 text-xs ${statusClass(session.status)}`}>{session.status}</span></td>
                      <td className="py-3 pr-4">{money(session.total_amount_centavos)}</td>
                      <td className="py-3 pr-4">{money(session.platform_fee_centavos)}</td>
                      <td className="py-3 pr-4">{money(session.refundable_amount_centavos)}</td>
                      <td className="py-3 pr-4">{session.tracking_pin || '-'}</td>
                      <td className="py-3 pr-4">
                        <div className="flex flex-wrap gap-2">
                          <Button size="sm" variant="outline" onClick={() => setExpandedSession(isExpanded ? '' : session.public_reference)}>{isExpanded ? 'Hide' : 'Details'}</Button>
                          <Button size="sm" variant="outline" disabled={!canRefundSession(session)} onClick={() => setRefundForm((form) => ({ ...form, payment_session_id: session.public_reference, amount: session.refundable_amount_centavos ? (Number(session.refundable_amount_centavos) / 100).toFixed(2) : form.amount }))}>Refund</Button>
                          {['paid', 'paid_manual_resolution_required', 'split_failed_manual_settlement_required'].includes(session.status) && (
                            <Button size="sm" variant="outline" disabled={retryingReference === session.public_reference} onClick={() => retryFinalization(session.public_reference)}>
                              {retryingReference === session.public_reference ? 'Retrying...' : 'Retry'}
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                    {isExpanded && (
                      <tr>
                        <td colSpan={8} className="bg-slate-50 p-4">
                          <div className="grid gap-4 lg:grid-cols-3">
                            <div className="space-y-1 text-xs">
                              <div className="font-semibold text-slate-900">Provider Evidence</div>
                              <div><strong>Intent:</strong> {session.provider_payment_intent_id || 'missing'}</div>
                              <div><strong>Payment:</strong> {session.provider_payment_id || 'missing'}</div>
                              <div><strong>Tenant merchant:</strong> {session.tenant_transfer_merchant_id || 'missing'}</div>
                            </div>
                            <div className="space-y-1 text-xs">
                              <div className="font-semibold text-slate-900">Lifecycle</div>
                              <div><strong>Paid:</strong> {session.paid_at || 'not paid'}</div>
                              <div><strong>Finalized:</strong> {session.finalized_at || 'not finalized'}</div>
                              <div><strong>Failure:</strong> {session.failure_code || '-'} {session.failure_reason || ''}</div>
                            </div>
                            <div className="space-y-1 text-xs">
                              <div className="font-semibold text-slate-900">Refunds</div>
                              {(session.refunds || []).length === 0 && <div>No refund attempts.</div>}
                              {(session.refunds || []).map((refund) => (
                                <div key={refund.refund_id} className="rounded border border-slate-200 bg-white p-2">
                                  <div><strong>{refund.refund_id}</strong> - {refund.status}</div>
                                  <div>{money(refund.amount_centavos)} / {refund.refund_strategy}</div>
                                  <div className="font-mono text-[11px]">{refund.provider_refund_id || 'provider pending'}</div>
                                </div>
                              ))}
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
              {sessions.length === 0 && (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-slate-500">No payment sessions found.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
      <ConfirmActionDialog
        open={Boolean(refundConfirmation)}
        onOpenChange={(open) => { if (!open) setRefundConfirmation(null); }}
        title="Submit PayMongo Refund"
        description={`Submit a ${money(refundConfirmation?.amountCentavos)} PayMongo refund for ${refundConfirmation?.sessionLabel || 'this payment session'}? This cannot be cancelled after PayMongo accepts it.`}
        confirmLabel="Submit Refund"
        variant="destructive"
        onConfirm={submitConfirmedRefund}
      />
    </div>
  );
}
