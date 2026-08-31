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

  if (dispatched.length === 0 && skipped.length === 0 && failed.length === 0) return null;

  return (
    <div className="mt-3 space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
      <p className="text-xs font-black uppercase tracking-wide text-slate-600">Last dispatch result</p>

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
