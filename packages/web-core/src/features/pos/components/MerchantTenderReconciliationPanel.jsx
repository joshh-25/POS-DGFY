import React, { useCallback, useEffect, useState } from 'react';
import { RefreshCcw, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { posToast as toast } from '@/src/utils/iminRuntimeFeedback.js';
import {
  fetchMerchantTenderReconciliation,
  reviewMerchantTenderReconciliation
} from '../services/posService.js';
import PosMobileDataCard from './PosMobileDataCard.jsx';
import PosShiftStateNotice from './PosShiftStateNotice.jsx';
import {
  POS_SHIFT_PRIMARY_BUTTON_CLASS,
  POS_SHIFT_SECONDARY_BUTTON_CLASS
} from './posShiftButtonStyles.js';

const MERCHANT_TENDER_METHODS = [
  { key: 'gcash', label: 'GCash' },
  { key: 'maya', label: 'Maya' },
  { key: 'card', label: 'Card terminal' },
  { key: 'bank_transfer', label: 'Bank transfer' }
];

const emptyObserved = { gcash: '', maya: '', card: '', bank_transfer: '' };
const money = (value) => Number(value || 0).toFixed(2);

const formatReviewDate = (value) => {
  if (!value) return '';
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toLocaleString() : '';
};

function resolveAuditStatus({ data, latest, method, observedAmount, variance }) {
  if (data?.is_stale) return { label: 'Re-review needed', className: 'border-amber-200 bg-amber-50 text-amber-800' };
  if (!latest) return { label: 'Not reviewed', className: 'border-slate-200 bg-slate-50 text-slate-600' };

  const savedObservedAmount = latest.observed_breakdown?.[method];
  if (savedObservedAmount != null && Math.abs(Number(savedObservedAmount) - observedAmount) > 0.0001) {
    return { label: 'Unsaved changes', className: 'border-blue-200 bg-blue-50 text-[#1A4E8D]' };
  }
  if (Math.abs(variance) <= 0.0001) {
    return { label: 'Balanced', className: 'border-emerald-200 bg-emerald-50 text-emerald-800' };
  }
  if (latest.status === 'variance_reviewed') {
    return { label: 'Variance reviewed', className: 'border-amber-200 bg-amber-50 text-amber-800' };
  }
  return { label: 'Review saved', className: 'border-slate-200 bg-slate-50 text-slate-700' };
}

function TenderCellLabel({ children }) {
  return <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-slate-500 md:hidden">{children}</span>;
}

export default function MerchantTenderReconciliationPanel({ shiftId, salesSummary = null, disabled = false }) {
  const [state, setState] = useState({ loading: true, saving: false, data: null, error: '' });
  const [observed, setObserved] = useState(emptyObserved);
  const [reviewNote, setReviewNote] = useState('');
  const employeeCredit = (Array.isArray(salesSummary?.payment_breakdown) ? salesSummary.payment_breakdown : [])
    .find((entry) => String(entry?.payment_type || '').trim().toLowerCase() === 'employee_credit') || {};
  const employeeCreditCount = Number(employeeCredit.count || 0);

  const load = useCallback(async () => {
    if (!shiftId) {
      setState({ loading: false, saving: false, data: null, error: 'The active shift identifier is unavailable.' });
      return;
    }
    setState((previous) => ({ ...previous, loading: true, error: '' }));
    try {
      const data = await fetchMerchantTenderReconciliation(shiftId);
      const latestObserved = data?.latest_reconciliation?.observed_breakdown;
      setObserved(Object.fromEntries(MERCHANT_TENDER_METHODS.map(({ key }) => [
        key,
        latestObserved?.[key] != null
          ? String(Number(latestObserved[key]).toFixed(2))
          : String(Number(data?.expected?.breakdown?.[key]?.amount || 0).toFixed(2))
      ])));
      setReviewNote(data?.latest_reconciliation?.review_note || '');
      setState({ loading: false, saving: false, data, error: '' });
    } catch (error) {
      setState({ loading: false, saving: false, data: null, error: error?.response?.data?.message || 'Unable to load merchant tender totals.' });
    }
  }, [shiftId]);

  useEffect(() => {
    void load();
  }, [load]);

  const variances = Object.fromEntries(MERCHANT_TENDER_METHODS.map(({ key }) => [
    key,
    Number(observed[key] || 0) - Number(state.data?.expected?.breakdown?.[key]?.amount || 0)
  ]));
  const hasVariance = MERCHANT_TENDER_METHODS.some(({ key }) => Math.abs(variances[key]) > 0.0001);

  const save = async () => {
    if (hasVariance && reviewNote.trim().length < 8) {
      toast.error('Add a manager note of at least 8 characters for the variance.');
      return;
    }
    setState((previous) => ({ ...previous, saving: true, error: '' }));
    try {
      const data = await reviewMerchantTenderReconciliation(shiftId, {
        idempotency_key: `merchant-tender:${shiftId}:${Date.now()}:${Math.random().toString(36).slice(2, 10)}`,
        observed_breakdown: Object.fromEntries(MERCHANT_TENDER_METHODS.map(({ key }) => [key, Number(observed[key] || 0)])),
        review_note: reviewNote.trim() || undefined
      });
      setState({ loading: false, saving: false, data, error: '' });
      toast.success(hasVariance ? 'Tender variance reviewed and recorded.' : 'Merchant tenders reconciled with no variance.');
    } catch (error) {
      setState((previous) => ({ ...previous, saving: false, error: error?.response?.data?.message || 'Unable to save the reconciliation.' }));
    }
  };

  const latest = state.data?.latest_reconciliation || null;
  const expectedBreakdown = state.data?.expected?.breakdown || {};

  return (
    <section
      aria-labelledby="pos-merchant-tender-heading"
      className="rounded-xl border border-blue-200 bg-white p-3 sm:p-4"
      data-testid="merchant-tender-reconciliation"
    >
      <header className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 id="pos-merchant-tender-heading" className="text-sm font-black text-[#0F172A]">Tender Reconciliation</h2>
            <span className="rounded-full border border-blue-200 bg-blue-50 px-2 py-0.5 text-[10px] font-bold text-[#1A4E8D]">4 channels</span>
          </div>
          <p className="mt-1 text-[11px] leading-4 text-slate-600">
            Compare POS totals with merchant settlements. Employee Credit is read-only. No PayMongo calls; sales stay unchanged.
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          className={`min-h-11 shrink-0 px-3 text-xs font-bold ${POS_SHIFT_SECONDARY_BUTTON_CLASS}`}
          onClick={() => void load()}
          disabled={state.loading || state.saving || disabled}
          aria-busy={state.loading || undefined}
        >
          <RefreshCcw className={`mr-1.5 h-3.5 w-3.5 ${state.loading ? 'animate-spin motion-reduce:animate-none' : ''}`} aria-hidden="true" />
          {state.loading ? 'Refreshing...' : 'Refresh'}
        </Button>
      </header>

      {state.error ? (
        <PosShiftStateNotice
          variant="error"
          title="Tender reconciliation unavailable"
          message={state.error}
          actionLabel="Try again"
          onAction={() => void load()}
          actionDisabled={state.loading || state.saving || disabled}
          compact
          className="mt-3"
        />
      ) : null}

      {state.loading && !state.data ? (
        <PosShiftStateNotice variant="loading" message="Loading expected tender totals..." compact className="mt-3" />
      ) : state.data ? (
        <>
          {state.data.is_stale ? (
            <PosShiftStateNotice
              variant="warning"
              message="New tender activity exists since the last review. Submit a new review; the previous record remains in the audit trail."
              compact
              className="mt-3"
            />
          ) : null}
          <ul
            className="pos-shift-mobile-view mt-3 grid min-w-0 gap-2 md:hidden"
            aria-label="Store-owned tender reconciliation"
            data-testid="merchant-tender-reconciliation-mobile-view"
          >
            {MERCHANT_TENDER_METHODS.map(({ key, label }) => {
              const expectedAmount = Number(expectedBreakdown[key]?.amount || 0);
              const observedAmount = Number(observed[key] || 0);
              const variance = variances[key];
              const auditStatus = resolveAuditStatus({ data: state.data, latest, method: key, observedAmount, variance });

              return (
                <li key={`mobile-${key}`} className="min-w-0">
                  <PosMobileDataCard
                    title={label}
                    action={(
                      <span className={`max-w-28 rounded-full border px-2 py-1 text-center text-[10px] font-bold leading-3 ${auditStatus.className}`}>
                        {auditStatus.label}
                      </span>
                    )}
                    fields={[
                      { key: 'expected', label: 'POS expected', value: `PHP ${money(expectedAmount)}`, align: 'right', numeric: true },
                      {
                        key: 'counted',
                        label: 'Counted',
                        value: (
                          <Input
                            aria-label={`${label} observed total`}
                            type="number"
                            min="0"
                            step="0.01"
                            className="h-10 w-full bg-white text-xs"
                            value={observed[key]}
                            onChange={(event) => setObserved((previous) => ({ ...previous, [key]: event.target.value }))}
                            disabled={state.loading || state.saving || disabled}
                          />
                        ),
                        align: 'right'
                      },
                      {
                        key: 'variance',
                        label: 'Variance',
                        value: `PHP ${money(variance)}`,
                        valueClassName: Math.abs(variance) > 0.0001 ? 'font-extrabold text-amber-800' : 'font-extrabold text-emerald-700',
                        align: 'right',
                        numeric: true
                      }
                    ]}
                  />
                </li>
              );
            })}
            <li className="min-w-0">
              <PosMobileDataCard
                titleLabel={`Internal receivable · ${employeeCreditCount} transaction${employeeCreditCount === 1 ? '' : 's'}`}
                title="Employee Credit"
                action={<span className="max-w-28 rounded-full border border-slate-200 bg-slate-100 px-2 py-1 text-center text-[10px] font-bold leading-3 text-slate-600">System locked</span>}
                className="border-blue-100 bg-blue-50/50"
                fields={[
                  { key: 'expected', label: 'POS expected', value: `PHP ${money(employeeCredit.amount)}`, valueClassName: 'font-extrabold text-[#1A4E8D]', align: 'right', numeric: true },
                  { key: 'counted', label: 'Counted', value: 'Not applicable', align: 'right' },
                  { key: 'variance', label: 'Variance', value: 'Not applicable', align: 'right' }
                ]}
              />
            </li>
          </ul>

          <div role="table" aria-label="Store-owned tender reconciliation" className="mt-3 hidden md:block">
            <div
              role="row"
              className="hidden grid-cols-[minmax(8rem,1.1fr)_minmax(7rem,1fr)_minmax(9rem,1.2fr)_minmax(6rem,.8fr)_minmax(8rem,1fr)] gap-3 rounded-t-lg bg-blue-50 px-3 py-2 text-[10px] font-extrabold uppercase tracking-wide text-[#1A4E8D] md:grid"
            >
              <span role="columnheader">Payment channel</span>
              <span role="columnheader">POS expected</span>
              <span role="columnheader">Counted / settlement app</span>
              <span role="columnheader">Variance</span>
              <span role="columnheader">Audit status</span>
            </div>
            <div role="rowgroup" className="space-y-2 md:space-y-0">
              {MERCHANT_TENDER_METHODS.map(({ key, label }) => {
                const expectedAmount = Number(expectedBreakdown[key]?.amount || 0);
                const observedAmount = Number(observed[key] || 0);
                const variance = variances[key];
                const auditStatus = resolveAuditStatus({ data: state.data, latest, method: key, observedAmount, variance });

                return (
                  <div
                    key={key}
                    role="row"
                    className="grid grid-cols-2 gap-x-3 gap-y-2 rounded-lg border border-slate-200 bg-white p-3 md:grid-cols-[minmax(8rem,1.1fr)_minmax(7rem,1fr)_minmax(9rem,1.2fr)_minmax(6rem,.8fr)_minmax(8rem,1fr)] md:items-center md:gap-3 md:rounded-none md:border-x-0 md:border-b-0 md:border-t md:px-3 md:py-2"
                  >
                    <div role="cell" className="col-span-2 flex min-w-0 items-center justify-between gap-2 md:col-span-1">
                      <span className="text-xs font-extrabold text-slate-800">{label}</span>
                      <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold md:hidden ${auditStatus.className}`}>
                        {auditStatus.label}
                      </span>
                    </div>
                    <div role="cell" className="min-w-0 text-xs font-semibold tabular-nums text-slate-700">
                      <TenderCellLabel>POS expected</TenderCellLabel>
                      PHP {money(expectedAmount)}
                    </div>
                    <div role="cell" className="min-w-0">
                      <TenderCellLabel>Counted / settlement app</TenderCellLabel>
                      <Input
                        aria-label={`${label} observed total`}
                        type="number"
                        min="0"
                        step="0.01"
                        className="h-11 w-full bg-white text-xs md:max-w-40"
                        value={observed[key]}
                        onChange={(event) => setObserved((previous) => ({ ...previous, [key]: event.target.value }))}
                        disabled={state.loading || state.saving || disabled}
                      />
                    </div>
                    <div role="cell" className={`min-w-0 text-xs font-extrabold tabular-nums ${Math.abs(variance) > 0.0001 ? 'text-amber-800' : 'text-emerald-700'}`}>
                      <TenderCellLabel>Variance</TenderCellLabel>
                      PHP {money(variance)}
                    </div>
                    <div role="cell" className="hidden md:block">
                      <span className={`inline-flex rounded-full border px-2 py-1 text-[10px] font-bold ${auditStatus.className}`}>
                        {auditStatus.label}
                      </span>
                    </div>
                  </div>
                );
              })}
              <div
                role="row"
                data-testid="employee-credit-reconciliation-row"
                className="grid grid-cols-2 gap-x-3 gap-y-2 rounded-lg border border-blue-100 bg-blue-50/50 p-3 md:grid-cols-[minmax(8rem,1.1fr)_minmax(7rem,1fr)_minmax(9rem,1.2fr)_minmax(6rem,.8fr)_minmax(8rem,1fr)] md:items-center md:gap-3 md:rounded-none md:border-x-0 md:border-b md:px-3 md:py-2"
              >
                <div role="cell" className="col-span-2 flex min-w-0 items-center justify-between gap-2 md:col-span-1">
                  <span className="text-xs font-extrabold text-slate-800">
                    Employee Credit
                    <span className="mt-0.5 block text-[10px] font-medium text-slate-500">Internal receivable · {employeeCreditCount} transaction{employeeCreditCount === 1 ? '' : 's'}</span>
                  </span>
                  <span className="rounded-full border border-slate-200 bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-600 md:hidden">System locked</span>
                </div>
                <div role="cell" className="min-w-0 text-xs font-bold tabular-nums text-[#1A4E8D]">
                  <TenderCellLabel>POS expected</TenderCellLabel>
                  PHP {money(employeeCredit.amount)}
                </div>
                <div role="cell" className="min-w-0 text-xs text-slate-500">
                  <TenderCellLabel>Counted / settlement app</TenderCellLabel>
                  Not applicable
                </div>
                <div role="cell" className="min-w-0 text-xs text-slate-500">
                  <TenderCellLabel>Variance</TenderCellLabel>
                  Not applicable
                </div>
                <div role="cell" className="hidden md:block">
                  <span className="inline-flex rounded-full border border-slate-200 bg-slate-100 px-2 py-1 text-[10px] font-bold text-slate-600">System locked · read-only</span>
                </div>
              </div>
            </div>
          </div>

          <div className="mt-3 grid gap-3 border-t border-slate-100 pt-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
            <div>
              <Label htmlFor="merchant-tender-review-note" className="text-xs font-extrabold text-slate-700">
                Manager review note {hasVariance ? '(required)' : '(optional)'}
              </Label>
              <Input
                id="merchant-tender-review-note"
                className="mt-1 h-11 bg-white text-xs"
                value={reviewNote}
                onChange={(event) => setReviewNote(event.target.value)}
                placeholder="Explain any difference from the POS ledger"
                disabled={state.loading || state.saving || disabled}
                aria-describedby="merchant-tender-review-status"
              />
              {hasVariance && reviewNote.trim().length < 8 ? (
                <p className="mt-1 text-[10px] text-amber-800">Enter at least 8 characters to record a variance review.</p>
              ) : null}
            </div>
            <Button
              type="button"
              className={`min-h-11 px-4 text-xs font-extrabold ${POS_SHIFT_PRIMARY_BUTTON_CLASS}`}
              onClick={() => void save()}
              disabled={state.loading || state.saving || disabled || (hasVariance && reviewNote.trim().length < 8)}
              aria-busy={state.saving || undefined}
            >
              <ShieldCheck className="mr-1.5 h-4 w-4" aria-hidden="true" />
              {state.saving ? 'Recording...' : 'Record Manager Review'}
            </Button>
          </div>
          <p id="merchant-tender-review-status" className="mt-2 text-[10px] text-slate-500" aria-live="polite">
            Latest: {latest ? `${String(latest.status || '').replace(/_/g, ' ')}${formatReviewDate(latest.reviewed_at) ? ` · ${formatReviewDate(latest.reviewed_at)}` : ''}` : 'Not reviewed yet'}
          </p>
        </>
      ) : null}
    </section>
  );
}
