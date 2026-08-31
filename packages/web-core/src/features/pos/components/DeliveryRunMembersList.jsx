import React from 'react';
import { ArrowRightLeft, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import ConfirmActionDialog from '@/components/ui/ConfirmActionDialog';
import { DELIVERY_JOB_STATUS_LABELS, FULFILLMENT_STATUS_LABELS } from './orderFulfillmentUi.js';

// Phase 226 (#1273). "Move to another run" is DELETE-then-ADD -- there is no server-side move
// verb (POST .../members 409s DELIVERY_JOB_ALREADY_IN_RUN if the job is already in a different
// run). Not atomic: if the ADD leg fails after the DELETE succeeded, the order is left in NO run.
// The confirm dialog states this two-step nature up front; on ADD failure the caller is expected
// to show a persistent error toast and refresh both runs so the operator can retry the add.

const LOCKED_OR_BLOCKED_RUN_STATUSES = new Set(['dispatched', 'completed', 'cancelled']);

export default function DeliveryRunMembersList({
  run = null,
  otherRuns = [],
  disabled = false,
  savingKey = '',
  onRemoveMember = async () => false,
  onMoveMember = async () => false
}) {
  const [pendingRemoveId, setPendingRemoveId] = React.useState(null);
  const [pendingMove, setPendingMove] = React.useState(null); // { posTransactionId, targetRunId }

  const members = Array.isArray(run?.members) ? run.members : [];
  const moveTargets = otherRuns.filter(
    (candidate) => candidate.delivery_run_id !== run?.delivery_run_id
      && !LOCKED_OR_BLOCKED_RUN_STATUSES.has(String(candidate.status || '').trim())
  );

  if (members.length === 0) {
    return (
      <p className="mt-3 rounded-lg border border-dashed border-slate-300 bg-slate-50 px-3 py-4 text-center text-xs text-slate-500">
        No orders in this run yet. Add orders from the Active Queue.
      </p>
    );
  }

  return (
    <div className="mt-3 space-y-2">
      {members.map((member) => {
        const order = member?.order || {};
        const rowKey = member.pos_transaction_id;
        return (
          <MemberRow
            key={rowKey}
            member={member}
            order={order}
            disabled={disabled}
            savingKey={savingKey}
            moveTargets={moveTargets}
            onRequestRemove={() => setPendingRemoveId(rowKey)}
            onRequestMove={(targetRunId) => setPendingMove({ posTransactionId: rowKey, targetRunId })}
          />
        );
      })}

      <ConfirmActionDialog
        open={pendingRemoveId !== null}
        onOpenChange={(open) => { if (!open) setPendingRemoveId(null); }}
        title="Remove order from this run?"
        description="The order's delivery job stays open but is no longer part of this run."
        confirmLabel="Remove"
        cancelLabel="Keep in run"
        variant="destructive"
        onConfirm={async () => {
          const succeeded = await onRemoveMember(pendingRemoveId);
          if (succeeded !== false) setPendingRemoveId(null);
          return succeeded;
        }}
      />

      <ConfirmActionDialog
        open={pendingMove !== null}
        onOpenChange={(open) => { if (!open) setPendingMove(null); }}
        title="Move order to another run?"
        description="Moving is two separate steps: this order is removed from the current run, then added to the target run. If the second step fails, the order is left in no run and must be re-added from the target run."
        confirmLabel="Move order"
        cancelLabel="Cancel"
        onConfirm={async () => {
          const succeeded = await onMoveMember(pendingMove?.posTransactionId, pendingMove?.targetRunId);
          if (succeeded !== false) setPendingMove(null);
          return succeeded;
        }}
      />
    </div>
  );
}

function MemberRow({ member, order, disabled, savingKey, moveTargets, onRequestRemove, onRequestMove }) {
  const [targetRunId, setTargetRunId] = React.useState('');
  const removeKey = `delivery-run-member-remove:${member.pos_transaction_id}`;
  const moveKey = `delivery-run-member-move:${member.pos_transaction_id}`;
  const rowBusy = savingKey === removeKey || savingKey === moveKey;

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-slate-200 bg-white p-3 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <p className="text-sm font-black text-slate-950">
          {order.invoice_number || `Order #${member.pos_transaction_id}`}
        </p>
        <p className="text-xs text-slate-500">
          {order.customer_name || 'Guest'} • {order.delivery_address || 'No address on file'}
        </p>
        <p className="mt-1 text-[11px] font-bold text-slate-600">
          {FULFILLMENT_STATUS_LABELS[order.fulfillment_status] || order.fulfillment_status || '-'}
          {' · '}
          {DELIVERY_JOB_STATUS_LABELS[member.status] || member.status || '-'}
          {member.delivery_personnel_name ? ` · ${member.delivery_personnel_name}` : ''}
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {moveTargets.length > 0 ? (
          <>
            <select
              value={targetRunId}
              onChange={(event) => setTargetRunId(event.target.value)}
              disabled={disabled || rowBusy}
              className="h-8 rounded-md border border-slate-200 bg-white px-2 text-xs font-semibold text-slate-700"
            >
              <option value="">Move to...</option>
              {moveTargets.map((candidate) => (
                <option key={candidate.delivery_run_id} value={candidate.delivery_run_id}>{candidate.label}</option>
              ))}
            </select>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={disabled || rowBusy || !targetRunId}
              onClick={() => onRequestMove(Number(targetRunId))}
            >
              <ArrowRightLeft className="mr-1 h-3.5 w-3.5" /> Move
            </Button>
          </>
        ) : null}
        <Button type="button" variant="outline" size="sm" disabled={disabled || rowBusy} onClick={onRequestRemove}>
          <Trash2 className="mr-1 h-3.5 w-3.5" /> Remove
        </Button>
      </div>
    </div>
  );
}
