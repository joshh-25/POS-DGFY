import React from 'react';
import { CheckCircle2, SkipForward, XCircle } from 'lucide-react';
import { getDeliveryRunDispatchReasonMessage } from '../utils/deliveryRunDispatchReasons.js';

// Phase 228 (#1273/#1271). Persistent three-bucket dispatch result panel -- deliberately NOT a
// toast: a run can have dozens of members, and a batch of per-order failures does not fit a toast
// (Phase 227's own residual-risk note flagged this same limit for the bulk add-to-run result). The
// caller also fires a summary toast alongside this panel; this is the durable, scrollable detail
// view that stays on screen until the next dispatch attempt replaces it.

export default function DeliveryRunDispatchSummary({ result = null }) {
  if (!result) return null;

  const dispatched = Array.isArray(result.dispatched) ? result.dispatched : [];
  const skipped = Array.isArray(result.skipped) ? result.skipped : [];
  const failed = Array.isArray(result.failed) ? result.failed : [];
  // Phase 338 (#1927): prefer the canonical per-member `warnings` array; fall back to the
  // legacy `loading_warning` buckets for responses predating it. The legacy buckets collapse
  // `pending`/`not_loaded` and carry no exception reasons, so the adapter labels them with the
  // same "not loaded/pending" wording the pre-338 panel used.
  const canonicalWarnings = Array.isArray(result.warnings) ? result.warnings : null;
  const loadingWarning = result.loading_warning || {};
  const unloaded = Array.isArray(loadingWarning.unloaded_pos_transaction_ids)
    ? loadingWarning.unloaded_pos_transaction_ids : [];
  const exceptions = Array.isArray(loadingWarning.exception_pos_transaction_ids)
    ? loadingWarning.exception_pos_transaction_ids : [];
  const warningEntries = canonicalWarnings
    ? canonicalWarnings.map((entry) => ({
      posTransactionId: entry.pos_transaction_id,
      loadingState: String(entry.loading_state || 'pending').trim().toLowerCase() || 'pending',
      exceptionReason: entry.exception_reason ?? null
    }))
    : [
      ...unloaded.map((id) => ({ posTransactionId: id, loadingState: 'not loaded/pending', exceptionReason: null })),
      ...exceptions.map((id) => ({ posTransactionId: id, loadingState: 'exception', exceptionReason: null }))
    ];

  if (dispatched.length === 0 && skipped.length === 0 && failed.length === 0 && warningEntries.length === 0) return null;

  const warningIds = warningEntries.map((entry) => `#${entry.posTransactionId}`).join(', ');

  return (
    <div className="mt-3 space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
      <p className="text-xs font-black uppercase tracking-wide text-slate-600">Last dispatch result</p>

      {warningEntries.length > 0 ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          Loading verification warning: {warningEntries.length} outstanding — dispatch was not blocked.
          <div className="mt-1">{warningIds}</div>
          <ul className="mt-1 space-y-1">
            {warningEntries.map((entry) => (
              <li key={entry.posTransactionId} className="text-xs text-amber-800">
                Order #{entry.posTransactionId} — {formatLoadingWarningState(entry)}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {dispatched.length > 0 ? (
        <ResultGroup
          icon={<CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />}
          label={`Dispatched (${dispatched.length})`}
          entries={dispatched.map((entry) => ({
            posTransactionId: entry.pos_transaction_id,
            message: 'Now out for delivery.'
          }))}
          tone="text-emerald-700"
        />
      ) : null}

      {skipped.length > 0 ? (
        <ResultGroup
          icon={<SkipForward className="h-3.5 w-3.5 text-slate-500" />}
          label={`Already dispatched (${skipped.length})`}
          entries={skipped.map((entry) => ({
            posTransactionId: entry.pos_transaction_id,
            message: getDeliveryRunDispatchReasonMessage(entry.reason_code)
          }))}
          tone="text-slate-600"
        />
      ) : null}

      {failed.length > 0 ? (
        <ResultGroup
          icon={<XCircle className="h-3.5 w-3.5 text-rose-600" />}
          label={`Failed (${failed.length})`}
          entries={failed.map((entry) => ({
            posTransactionId: entry.pos_transaction_id,
            message: entry.message || getDeliveryRunDispatchReasonMessage(entry.reason_code)
          }))}
          tone="text-rose-700"
        />
      ) : null}
    </div>
  );
}

function formatLoadingWarningState(entry) {
  if (entry.loadingState === 'exception') {
    return entry.exceptionReason
      ? `loading exception: ${entry.exceptionReason}`
      : 'loading exception';
  }
  if (entry.loadingState === 'not_loaded') return 'not loaded';
  // Legacy `loading_warning` adapter label (pending/not_loaded were one bucket there).
  if (entry.loadingState === 'not loaded/pending') return 'not loaded/pending';
  return `loading ${entry.loadingState}`;
}

function ResultGroup({ icon, label, entries, tone }) {
  return (
    <div>
      <p className={`flex items-center gap-1 text-[11px] font-bold ${tone}`}>{icon} {label}</p>
      <ul className="mt-1 space-y-1">
        {entries.map((entry) => (
          <li key={entry.posTransactionId} className="text-xs text-slate-600">
            Order #{entry.posTransactionId} — {entry.message}
          </li>
        ))}
      </ul>
    </div>
  );
}
