import React, { useCallback, useEffect, useState } from 'react';
import { RefreshCw, RotateCcw } from 'lucide-react';
import ConfirmActionDialog from '@/components/ui/ConfirmActionDialog';
import { Button } from '@/components/ui/button';
import * as adminService from '@/services/adminService';
import { toast } from 'sonner';

const refundStatusClass = (status) => {
  const normalized = String(status || '').toLowerCase();
  if (normalized === 'succeeded') return 'border-emerald-200 bg-emerald-50 text-emerald-700';
  if (['created', 'pending'].includes(normalized)) return 'border-amber-200 bg-amber-50 text-amber-700';
  if (['failed', 'manual_review_required'].includes(normalized)) return 'border-rose-200 bg-rose-50 text-rose-700';
  return 'border-slate-200 bg-slate-50 text-slate-700';
};

const money = (centavos) => `PHP ${((Number(centavos || 0)) / 100).toLocaleString('en-PH', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2
})}`;

const formatDateTime = (value) => {
  if (!value) return 'Unknown time';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Unknown time' : date.toLocaleString();
};

const formatAge = (value) => {
  const createdAt = new Date(value).getTime();
  if (!Number.isFinite(createdAt)) return 'Unknown';
  const totalMinutes = Math.max(0, Math.floor((Date.now() - createdAt) / 60000));
  const days = Math.floor(totalMinutes / 1440);
  const hours = Math.floor((totalMinutes % 1440) / 60);
  const minutes = totalMinutes % 60;
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
};

const errorMessage = (error) => error?.response?.data?.message || error?.message || 'The refund retry could not be completed.';

export default function RefundAttemptsPanel({ adminProfile = null, onSessionsRefresh = null }) {
  const [refunds, setRefunds] = useState([]);
  const [statusFilter, setStatusFilter] = useState('');
  const [loading, setLoading] = useState(false);
  const [retryTarget, setRetryTarget] = useState(null);

  const loadRefunds = useCallback(async () => {
    setLoading(true);
    try {
      const response = await adminService.listCommerceRefunds(statusFilter ? { status: statusFilter } : {});
      setRefunds(response.data?.refunds || []);
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => {
    loadRefunds();
  }, [loadRefunds]);

  const submitRetry = async (reason) => {
    if (!retryTarget) return { success: false, message: 'Choose a refund attempt to retry.' };
    try {
      const response = await adminService.retryCommercePaymentRefund(
        retryTarget.payment_session?.public_reference,
        retryTarget.public_reference,
        { reason }
      );
      const newRefund = response.data?.refund;
      const newReference = newRefund?.public_reference || newRefund?.refund_id || 'new attempt';
      const status = String(newRefund?.status || 'unknown').toLowerCase();

      if (status === 'succeeded') {
        toast.success(`Retry ${newReference} (succeeded): PayMongo confirmed refund.`);
      } else if (['pending', 'created'].includes(status)) {
        toast.info(`Retry ${newReference} (${status}): submitted — awaiting PayMongo confirmation.`);
      } else if (status === 'failed') {
        toast.error(`Retry ${newReference} (failed): PayMongo rejected the retry.`);
      } else {
        toast.info(`Retry ${newReference} (${status}).`);
      }

      await Promise.all([
        loadRefunds(),
        onSessionsRefresh ? onSessionsRefresh() : Promise.resolve()
      ]);
      return true;
    } catch (error) {
      return { success: false, message: errorMessage(error) };
    }
  };

  const initiatedBy = adminProfile?.username || adminProfile?.email || 'current Platform Admin';
  const retryDescription = retryTarget
    ? `Payment session ${retryTarget.payment_session?.public_reference || 'unknown'}, POS order ${retryTarget.payment_session?.pos_transaction_id ?? 'unknown'}, amount ${money(retryTarget.amount_centavos)}, original refund ${retryTarget.public_reference}. Original failure: ${retryTarget.failure_reason || retryTarget.failure_code || 'No failure details recorded.'} Initiated by ${initiatedBy} at ${retryTarget.initiatedAt}. The server records the authenticated actor.`
    : '';

  return (
    <section className="space-y-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-semibold text-slate-900">Refund Attempts</h2>
          <p className="mt-1 text-xs text-slate-500">Across payment sessions. Retry eligibility is checked by the server before any PayMongo submission.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="sr-only" htmlFor="refund-attempt-status">Filter refund attempts by status</label>
          <select
            id="refund-attempt-status"
            aria-label="Refund attempt status"
            className="h-9 rounded-md border border-slate-300 px-3 text-sm"
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value)}
          >
            <option value="">All statuses</option>
            <option value="failed">Failed</option>
            <option value="manual_review_required">Manual review required</option>
            <option value="pending">Pending</option>
            <option value="created">Created</option>
            <option value="succeeded">Succeeded</option>
          </select>
          <Button type="button" size="sm" variant="outline" disabled={loading} onClick={loadRefunds}>
            <RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            {loading ? 'Refreshing...' : 'Refresh'}
          </Button>
        </div>
      </div>

      <div className="overflow-x-auto rounded-lg border border-slate-200">
        <table className="min-w-[1250px] w-full text-left text-xs">
          <thead className="bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-3 py-2">Refund reference</th>
              <th className="px-3 py-2">Session</th>
              <th className="px-3 py-2">Store / tenant</th>
              <th className="px-3 py-2">Amount</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2">PayMongo refund ID</th>
              <th className="px-3 py-2">Failure</th>
              <th className="px-3 py-2">Initiated / created</th>
              <th className="px-3 py-2">Age</th>
              <th className="px-3 py-2">Retry link</th>
              <th className="px-3 py-2">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {refunds.map((refund) => {
              const isAwaitingProvider = ['pending', 'created'].includes(refund.status);
              return (
                <tr key={refund.public_reference}>
                  <td className="px-3 py-3 font-mono font-semibold text-slate-900">{refund.public_reference}</td>
                  <td className="px-3 py-3 font-mono">{refund.payment_session?.public_reference || 'Unknown'}</td>
                  <td className="px-3 py-3">
                    <div>{refund.payment_session?.store_slug || 'Store not recorded'}</div>
                    <div className="mt-1 text-[10px] text-slate-500">{refund.payment_session?.tenant_id || 'Tenant not recorded'}</div>
                  </td>
                  <td className="px-3 py-3 whitespace-nowrap">{money(refund.amount_centavos)}</td>
                  <td className="px-3 py-3">
                    <span className={`inline-flex rounded-full border px-2 py-1 font-medium ${refundStatusClass(refund.status)}`}>
                      {refund.status}
                    </span>
                    {isAwaitingProvider && <div className="mt-1 font-semibold text-amber-700">Awaiting provider confirmation</div>}
                  </td>
                  <td className="px-3 py-3 font-mono">{refund.provider_refund_id || 'none'}</td>
                  <td className="max-w-56 break-words px-3 py-3">
                    <div>{refund.failure_code || '—'}</div>
                    {refund.failure_reason && <div className="mt-1 text-slate-500">{refund.failure_reason}</div>}
                  </td>
                  <td className="px-3 py-3">
                    <div>{refund.requested_by || 'Unknown admin'}</div>
                    <div className="mt-1 text-slate-500">{formatDateTime(refund.created_at)}</div>
                  </td>
                  <td className={`px-3 py-3 whitespace-nowrap ${isAwaitingProvider ? 'text-sm font-bold text-amber-800' : 'text-slate-600'}`}>
                    {formatAge(refund.created_at)}
                  </td>
                  <td className="px-3 py-3">
                    {refund.retry_of && <div>Retry of {refund.retry_of}</div>}
                    {(refund.retry_child_references || []).map((reference) => <div key={reference}>Retried as {reference}</div>)}
                    {refund.has_retry && !(refund.retry_child_references || []).length && <div>Retried</div>}
                    {!refund.retry_of && !refund.has_retry && <span className="text-slate-400">—</span>}
                  </td>
                  <td className="px-3 py-3">
                    {refund.retry_eligible && (
                      <Button
                        type="button"
                        size="sm"
                        variant="destructive"
                        onClick={() => setRetryTarget({ ...refund, initiatedAt: new Date().toLocaleString() })}
                      >
                        <RotateCcw className="mr-1 h-3.5 w-3.5" /> Retry
                      </Button>
                    )}
                  </td>
                </tr>
              );
            })}
            {refunds.length === 0 && (
              <tr><td colSpan={11} className="px-3 py-8 text-center text-slate-500">No refund attempts match this filter.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <ConfirmActionDialog
        open={Boolean(retryTarget)}
        onOpenChange={(open) => { if (!open) setRetryTarget(null); }}
        title="Retry PayMongo refund"
        description={retryDescription}
        confirmLabel="Retry refund"
        variant="destructive"
        reasonLabel="Retry reason"
        reasonPlaceholder="Explain why this refund should be retried"
        reasonRequired
        reasonMinLength={3}
        onConfirm={submitRetry}
      />
    </section>
  );
}
