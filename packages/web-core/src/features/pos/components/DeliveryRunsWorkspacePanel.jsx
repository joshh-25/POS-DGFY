import React from 'react';
import { toast } from 'sonner';
import { Plus, RefreshCw, Truck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import ConfirmActionDialog from '@/components/ui/ConfirmActionDialog';
import {
  addDeliveryRunMembers,
  createDeliveryRun,
  dispatchDeliveryRun,
  fetchDeliveryRun,
  fetchDeliveryRuns,
  removeDeliveryRunMember,
  setDeliveryRunPersonnel,
  updateDeliveryRun
} from '../services/deliveryRunService.js';
import DeliveryRunFormDialog from './DeliveryRunFormDialog.jsx';
import DeliveryRunPersonnelEditor from './DeliveryRunPersonnelEditor.jsx';
import DeliveryRunMembersList from './DeliveryRunMembersList.jsx';
import DeliveryRunDispatchSummary from './DeliveryRunDispatchSummary.jsx';
import { getDeliveryRunDispatchReasonMessage } from '../utils/deliveryRunDispatchReasons.js';

// Phase 226 (#1273). Self-contained master/detail panel over Phase 225's delivery-run API,
// modeled on DeliveryPersonnelManagementPanel.jsx / EmployeeCreditManagementPanel.jsx: panel-local
// state, own fetches, toast on error. Retail gating is the CALLER's job (TerminalOperationsPanels
// only renders this when normalizeWorkflowMode(workflowMode) === 'retail') -- this component does
// not re-check the mode itself.

const RUN_STATUS_LABELS = Object.freeze({
  draft: 'Draft',
  scheduled: 'Scheduled',
  dispatched: 'Dispatched',
  completed: 'Completed',
  cancelled: 'Cancelled'
});

const LOCKED_RUN_STATUSES = new Set(['dispatched', 'completed']);

// Phase 228 (#1273/#1271). Distinct from LOCKED_RUN_STATUSES above -- `dispatched` is deliberately
// absent here, matching buildDispatchDeliveryRunUseCase's own RUN_DISPATCH_BLOCKED_STATUSES: the
// Dispatch button stays enabled (relabeled "Re-dispatch run") on an already-dispatched run, since
// re-dispatch is the retry path for stragglers.
const DISPATCH_BLOCKED_STATUSES = new Set(['completed', 'cancelled']);
// #1272 (2026-08-31), retail-only backstop: pre-flight client-side check only, the 409 is the real
// gate. This panel is only ever rendered in retail mode (see the module comment above), so no
// workflow-mode check is needed here.
const PRE_PACKED_FULFILLMENT_STATUSES = new Set(['placed', 'confirmed', 'preparing']);

const createIdempotencyKey = (prefix) => `${prefix}-${globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`}`;

const getErrorMessage = (error, fallback) => (
  error?.response?.data?.message || fallback
);

export default function DeliveryRunsWorkspacePanel({
  canViewPos = false,
  canTransactPos = false,
  locked = false,
  isOnline = true,
  hasActiveShift = false,
  queueLocationScopeId = null,
  deliveryPersonnelState = { loading: false, personnel: [], accessState: 'not_required' },
  ensureDeliveryPersonnelLoaded = () => {},
  onRunCountChange = () => {}
}) {
  const [runsState, setRunsState] = React.useState({
    loading: false,
    loaded: false,
    items: [],
    pagination: { total: 0, page: 1, limit: 20 },
    accessState: 'idle',
    errorMessage: ''
  });
  const [statusFilter, setStatusFilter] = React.useState('');
  const [selectedRunId, setSelectedRunId] = React.useState(null);
  const [runDetailState, setRunDetailState] = React.useState({ loading: false, run: null, errorMessage: '' });
  const [savingKey, setSavingKey] = React.useState('');
  const [formOpen, setFormOpen] = React.useState(false);
  const [formRun, setFormRun] = React.useState(null);
  const [dispatchConfirmOpen, setDispatchConfirmOpen] = React.useState(false);
  const [dispatchResult, setDispatchResult] = React.useState(null);

  // RF-3 fix (PR #1277 review): a request-generation counter per fetch kind so a slower, older
  // response can never overwrite state committed by a newer one (e.g. two location-scope switches
  // in quick succession, or a scope switch racing the request it interrupted).
  const runsRequestIdRef = React.useRef(0);
  const runDetailRequestIdRef = React.useRef(0);

  const loadRuns = React.useCallback(async () => {
    const requestId = (runsRequestIdRef.current += 1);
    setRunsState((current) => ({ ...current, loading: true, accessState: 'loading' }));
    try {
      const payload = await fetchDeliveryRuns({
        status: statusFilter || undefined,
        location_id: queueLocationScopeId || undefined,
        limit: 100
      });
      if (requestId !== runsRequestIdRef.current) return; // stale -- a newer request has since started
      const items = Array.isArray(payload?.items) ? payload.items : [];
      setRunsState({
        loading: false,
        loaded: true,
        items,
        pagination: payload?.pagination || { total: items.length, page: 1, limit: 100 },
        accessState: 'allowed',
        errorMessage: ''
      });
      onRunCountChange(items.length);
    } catch (error) {
      if (requestId !== runsRequestIdRef.current) return; // stale
      const isForbidden = error?.response?.status === 403;
      setRunsState({
        loading: false,
        loaded: true,
        items: [],
        pagination: { total: 0, page: 1, limit: 100 },
        accessState: isForbidden ? 'forbidden' : 'error',
        errorMessage: isForbidden ? '' : getErrorMessage(error, 'Failed to load delivery runs.')
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter, queueLocationScopeId]);

  React.useEffect(() => {
    loadRuns();
  }, [loadRuns]);

  React.useEffect(() => {
    ensureDeliveryPersonnelLoaded();
  }, [ensureDeliveryPersonnelLoaded]);

  const loadRunDetail = React.useCallback(async (deliveryRunId) => {
    const requestId = (runDetailRequestIdRef.current += 1);
    if (!deliveryRunId) {
      setRunDetailState({ loading: false, run: null, errorMessage: '' });
      return;
    }
    setRunDetailState((current) => ({ ...current, loading: true }));
    try {
      const run = await fetchDeliveryRun(deliveryRunId);
      if (requestId !== runDetailRequestIdRef.current) return; // stale
      setRunDetailState({ loading: false, run, errorMessage: '' });
    } catch (error) {
      if (requestId !== runDetailRequestIdRef.current) return; // stale
      setRunDetailState({ loading: false, run: null, errorMessage: getErrorMessage(error, 'Failed to load run detail.') });
    }
  }, []);

  // RF-3 fix (PR #1277 review): a location-scope switch must not leave a previously selected run's
  // (or a previous scope's runs list) data visible under the new scope. Clear the selection/detail
  // synchronously on the scope change itself -- don't wait for the new fetchDeliveryRuns/
  // fetchDeliveryRun to resolve -- and bump the detail request generation so any in-flight fetch
  // from the old scope is discarded rather than committed.
  const previousLocationScopeRef = React.useRef(queueLocationScopeId);
  React.useEffect(() => {
    if (previousLocationScopeRef.current === queueLocationScopeId) return;
    previousLocationScopeRef.current = queueLocationScopeId;
    runDetailRequestIdRef.current += 1;
    setSelectedRunId(null);
    setRunDetailState({ loading: false, run: null, errorMessage: '' });
    setDispatchResult(null);
  }, [queueLocationScopeId]);

  React.useEffect(() => {
    loadRunDetail(selectedRunId);
  }, [selectedRunId, loadRunDetail]);

  const selectRun = (deliveryRunId) => {
    setSelectedRunId(deliveryRunId === selectedRunId ? null : deliveryRunId);
    setDispatchResult(null);
  };

  const refreshAll = async () => {
    await loadRuns();
    if (selectedRunId) await loadRunDetail(selectedRunId);
  };

  const openCreateForm = () => {
    setFormRun(null);
    setFormOpen(true);
  };

  const openEditForm = (run) => {
    setFormRun(run);
    setFormOpen(true);
  };

  const handleFormSubmit = async (payload) => {
    if (!isOnline) {
      toast.error('Reconnect before saving delivery runs.');
      return false;
    }
    setSavingKey('form');
    try {
      if (formRun?.delivery_run_id) {
        await updateDeliveryRun(formRun.delivery_run_id, payload);
        toast.success('Delivery run updated.');
      } else {
        const created = await createDeliveryRun(payload);
        toast.success('Delivery run created.');
        if (created?.delivery_run_id) setSelectedRunId(created.delivery_run_id);
      }
      await refreshAll();
      return true;
    } catch (error) {
      toast.error(getErrorMessage(error, 'Failed to save delivery run.'));
      return false;
    } finally {
      setSavingKey('');
    }
  };

  // RF-1 fix (PR #1277 review): retain the idempotency key for a logical personnel-submit across
  // retries of that same submit -- keyed on a snapshot of the personnel payload being sent, so a
  // retry (identical payload) reuses the key, while genuinely editing the roster again (a
  // different payload) is treated as a new logical submit and gets a fresh key. Cleared on
  // success so the next distinct save starts clean.
  // RF-4 fix (PR #1277 review, round 3): the signature is scoped by run.delivery_run_id as well as
  // the personnel payload -- otherwise switching from run A to run B and coincidentally building an
  // identical roster payload would reuse A's key for B's genuine write, risking the server treating
  // B's PUT as a replay of A's and silently not applying it.
  const personnelSubmitRef = React.useRef({ key: null, signature: null });

  const handleSavePersonnel = async (personnel) => {
    const run = runDetailState.run;
    if (!run) return false;
    if (!isOnline) {
      toast.error('Reconnect before saving delivery run personnel.');
      return false;
    }
    const signature = `${run.delivery_run_id}:${JSON.stringify(personnel)}`;
    if (personnelSubmitRef.current.signature !== signature) {
      personnelSubmitRef.current = { key: createIdempotencyKey('run-personnel'), signature };
    }
    setSavingKey('personnel');
    try {
      await setDeliveryRunPersonnel(run.delivery_run_id, {
        idempotency_key: personnelSubmitRef.current.key,
        personnel
      });
      toast.success('Run personnel saved.');
      personnelSubmitRef.current = { key: null, signature: null };
      await refreshAll();
      return true;
    } catch (error) {
      // F-3 fix (Phase 227, #1273): `error_code` is the DomainErrorCode ('CONFLICT'), not the
      // reason -- the actual per-condition reason lives under `errors.reason_code`. Checking
      // `error_code === 'DELIVERY_RUN_LOCKED'` never fires; read the reason_code instead.
      const reasonCode = error?.response?.data?.errors?.reason_code;
      const message = reasonCode === 'DELIVERY_RUN_LOCKED'
        ? 'This run is locked and can no longer be edited.'
        : getErrorMessage(error, 'Failed to save run personnel.');
      toast.error(message);
      return false;
    } finally {
      setSavingKey('');
    }
  };

  const handleRemoveMember = async (posTransactionId) => {
    const run = runDetailState.run;
    if (!run) return false;
    if (!isOnline) {
      toast.error('Reconnect before removing an order from a run.');
      return false;
    }
    const key = `delivery-run-member-remove:${posTransactionId}`;
    setSavingKey(key);
    try {
      await removeDeliveryRunMember(run.delivery_run_id, posTransactionId);
      toast.success('Order removed from run.');
      await refreshAll();
      return true;
    } catch (error) {
      toast.error(getErrorMessage(error, 'Failed to remove order from run.'));
      return false;
    } finally {
      setSavingKey('');
    }
  };

  // RF-1 fix (PR #1277 review): same retention pattern as personnel-save, keyed on
  // (posTransactionId, targetRunId) since that pair identifies the logical move being retried;
  // starting a move for a different member or a different target run gets a fresh key.
  const moveAddSubmitRef = React.useRef({ key: null, posTransactionId: null, targetRunId: null });

  const handleMoveMember = async (posTransactionId, targetRunId) => {
    const run = runDetailState.run;
    if (!run || !targetRunId) return false;
    if (!isOnline) {
      toast.error('Reconnect before moving an order between runs.');
      return false;
    }
    if (!hasActiveShift) {
      toast.error('Open a shift before adding orders to a run.');
      return false;
    }
    // RF-2 fix (PR #1277 review): never attempt the DELETE leg if the target run has no
    // accountable person -- the ADD would 409 on DELIVERY_RUN_ACCOUNTABLE_REQUIRED after the
    // member has already been removed from the source run, leaving it in no run at all. The
    // target-run picker already excludes these runs (DeliveryRunMembersList.jsx), but this guard
    // covers any caller that bypasses the picker.
    // RF-5 fix (PR #1277 review, round 3): match the actual invariant -- exactly one accountable
    // person, not merely "at least one" -- rather than relying on the DB unique index holding.
    const targetRun = runs.find((candidate) => candidate.delivery_run_id === targetRunId);
    const targetHasAccountable = Array.isArray(targetRun?.personnel)
      && targetRun.personnel.filter((person) => person?.is_accountable).length === 1;
    if (!targetHasAccountable) {
      toast.error('The target run has no accountable person set. Choose a different run.');
      return false;
    }
    if (
      moveAddSubmitRef.current.posTransactionId !== posTransactionId
      || moveAddSubmitRef.current.targetRunId !== targetRunId
    ) {
      moveAddSubmitRef.current = { key: createIdempotencyKey('run-move-add'), posTransactionId, targetRunId };
    }
    const key = `delivery-run-member-move:${posTransactionId}`;
    setSavingKey(key);
    try {
      await removeDeliveryRunMember(run.delivery_run_id, posTransactionId);
    } catch (error) {
      setSavingKey('');
      toast.error(getErrorMessage(error, 'Failed to remove order from the current run; move cancelled.'));
      return false;
    }
    try {
      await addDeliveryRunMembers(targetRunId, {
        idempotency_key: moveAddSubmitRef.current.key,
        pos_transaction_ids: [posTransactionId]
      });
      toast.success('Order moved to the new run.');
      moveAddSubmitRef.current = { key: null, posTransactionId: null, targetRunId: null };
      await refreshAll();
      return true;
    } catch (error) {
      // Phase 226 (#1273) plan §6: the DELETE leg already succeeded here -- the order is now in
      // NO run. A persistent error toast (no auto-dismiss) plus an auto-refresh of both runs is
      // the mitigation so the operator can see the order is unassigned and retry the add from the
      // target run's own workspace.
      toast.error(
        `Order #${posTransactionId} was removed from the run but could not be added to the target run. It is currently in no run -- retry adding it from the target run.`,
        { duration: Infinity }
      );
      await refreshAll();
      return false;
    } finally {
      setSavingKey('');
    }
  };

  // Phase 228 (#1273/#1271). Idempotency key signature matches Phase 226/227's established
  // retention pattern: identical (run, member set) reuses the key on retry; a changed member set
  // (e.g. a member removed between attempts) is treated as a new logical dispatch call and gets a
  // fresh key.
  const dispatchSubmitRef = React.useRef({ key: null, signature: null });

  const handleDispatchRun = async () => {
    const run = runDetailState.run;
    if (!run) return false;
    if (!isOnline) {
      toast.error('Reconnect before dispatching a delivery run.');
      return false;
    }
    const sortedMemberIds = (Array.isArray(run.members) ? run.members : [])
      .map((member) => member.pos_transaction_id)
      .sort((a, b) => a - b);
    const signature = `${run.delivery_run_id}:dispatch:${sortedMemberIds.join(',')}`;
    if (dispatchSubmitRef.current.signature !== signature) {
      dispatchSubmitRef.current = { key: createIdempotencyKey('run-dispatch'), signature };
    }
    setSavingKey('dispatch');
    try {
      const result = await dispatchDeliveryRun(run.delivery_run_id, {
        idempotency_key: dispatchSubmitRef.current.key
      });
      setDispatchResult(result);
      const dispatchedCount = Array.isArray(result?.dispatched) ? result.dispatched.length : 0;
      const failedCount = Array.isArray(result?.failed) ? result.failed.length : 0;
      const skippedCount = Array.isArray(result?.skipped) ? result.skipped.length : 0;
      if (failedCount > 0) {
        toast.warning(`Dispatched ${dispatchedCount}, ${skippedCount} already dispatched, ${failedCount} failed. See the run detail for reasons.`);
      } else {
        toast.success(`Dispatched ${dispatchedCount} order(s)${skippedCount > 0 ? `, ${skippedCount} already dispatched` : ''}.`);
      }
      dispatchSubmitRef.current = { key: null, signature: null };
      await refreshAll();
      return true;
    } catch (error) {
      // Same reason_code-under-`errors` pattern as F-3 (Phase 227): the actual reason lives under
      // `errors.reason_code`, not `error_code`.
      const reasonCode = error?.response?.data?.errors?.reason_code;
      if (reasonCode === 'DELIVERY_RUN_UNPACKED_MEMBERS') {
        const unpacked = error?.response?.data?.errors?.unpacked || [];
        const orderList = unpacked.map((entry) => `#${entry.pos_transaction_id}`).join(', ');
        toast.error(`Every order must be packed before dispatch. Not yet packed: ${orderList || 'see run detail'}.`);
      } else {
        toast.error(reasonCode
          ? getDeliveryRunDispatchReasonMessage(reasonCode, getErrorMessage(error, 'Failed to dispatch delivery run.'))
          : getErrorMessage(error, 'Failed to dispatch delivery run.'));
      }
      return false;
    } finally {
      setSavingKey('');
    }
  };

  const runs = Array.isArray(runsState.items) ? runsState.items : [];
  const selectedRun = runDetailState.run;
  const selectedRunLocked = selectedRun ? LOCKED_RUN_STATUSES.has(String(selectedRun.status || '').trim()) : false;
  const hasAccountablePersonnel = Array.isArray(selectedRun?.personnel)
    && selectedRun.personnel.some((person) => person?.is_accountable);
  const canManage = canTransactPos && !locked;

  // Phase 228 (#1273/#1271). Dispatch pre-flight: a backstop, client-side mirror of the server's
  // own 409 preconditions -- the 409 stays the real gate, this only saves an operator a round trip.
  const selectedRunMembers = Array.isArray(selectedRun?.members) ? selectedRun.members : [];
  const selectedRunStatus = String(selectedRun?.status || '').trim();
  const selectedRunIsDispatched = selectedRunStatus === 'dispatched';
  const unpackedMembers = selectedRunMembers.filter((member) => (
    PRE_PACKED_FULFILLMENT_STATUSES.has(String(member?.order?.fulfillment_status || '').trim())
  ));
  const dispatchDisabled = !selectedRun
    || !canTransactPos
    || locked
    || !isOnline
    || !hasActiveShift
    || !hasAccountablePersonnel
    || selectedRunMembers.length === 0
    || DISPATCH_BLOCKED_STATUSES.has(selectedRunStatus)
    || unpackedMembers.length > 0;

  if (runsState.accessState === 'forbidden') {
    return (
      <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-3 text-xs text-slate-600">
        You don't have permission to view delivery runs.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-2 text-xs font-bold text-slate-600">
            Status
            <select
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
              className="h-9 rounded-md border border-slate-200 bg-white px-2 text-xs font-semibold"
            >
              <option value="">All</option>
              {Object.entries(RUN_STATUS_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </label>
          <Button type="button" variant="outline" size="sm" onClick={refreshAll} disabled={runsState.loading}>
            <RefreshCw className={`mr-1 h-3.5 w-3.5 ${runsState.loading ? 'animate-spin' : ''}`} /> Refresh
          </Button>
        </div>
        <Button type="button" size="sm" onClick={openCreateForm} disabled={!canManage} className="!bg-[#1A4E8D] text-white hover:!bg-[#123B6D]">
          <Plus className="mr-1 h-3.5 w-3.5" /> New run
        </Button>
      </div>

      {runsState.errorMessage ? (
        <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">{runsState.errorMessage}</p>
      ) : null}

      {runs.length === 0 && !runsState.loading ? (
        <p className="rounded-xl border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">
          <Truck className="mx-auto mb-2 h-6 w-6 text-slate-400" />
          No delivery runs yet.
        </p>
      ) : null}

      <div className="grid gap-2">
        {runs.map((run) => {
          const isSelected = selectedRunId === run.delivery_run_id;
          return (
            <button
              key={run.delivery_run_id}
              type="button"
              onClick={() => selectRun(run.delivery_run_id)}
              className={`w-full rounded-xl border p-3 text-left transition ${isSelected
                ? 'border-[#1A4E8D] bg-blue-50/60'
                : 'border-slate-200 bg-white hover:border-blue-200'}`}
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-black text-slate-950">{run.label}</p>
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-bold text-slate-600">
                  {RUN_STATUS_LABELS[run.status] || run.status}
                </span>
              </div>
              <p className="mt-1 text-xs text-slate-500">
                {run.scheduled_date ? String(run.scheduled_date).slice(0, 10) : 'No schedule set'}
                {' · '}
                {Number.isFinite(Number(run.member_count)) ? run.member_count : 0} order(s)
              </p>
            </button>
          );
        })}
      </div>

      {selectedRunId ? (
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          {runDetailState.loading ? (
            <p className="text-sm text-slate-500">Loading run...</p>
          ) : runDetailState.errorMessage ? (
            <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">{runDetailState.errorMessage}</p>
          ) : selectedRun ? (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h4 className="text-base font-black text-slate-950">{selectedRun.label}</h4>
                  <p className="text-xs text-slate-500">{selectedRun.notes || 'No notes'}</p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Button type="button" variant="outline" size="sm" onClick={() => openEditForm(selectedRun)} disabled={!canManage || selectedRunLocked}>
                    Edit run
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => setDispatchConfirmOpen(true)}
                    disabled={dispatchDisabled || savingKey === 'dispatch'}
                    className="!bg-[#1A4E8D] text-white hover:!bg-[#123B6D]"
                  >
                    <Truck className="mr-1 h-3.5 w-3.5" /> {selectedRunIsDispatched ? 'Re-dispatch run' : 'Dispatch run'}
                  </Button>
                </div>
              </div>

              {unpackedMembers.length > 0 ? (
                <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                  Every order must be packed before this run can be dispatched. Not yet packed:{' '}
                  {unpackedMembers.map((member) => `#${member.pos_transaction_id}`).join(', ')}.
                </p>
              ) : null}

              <DeliveryRunDispatchSummary result={dispatchResult} />

              {selectedRunLocked ? (
                <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
                  This run is {RUN_STATUS_LABELS[selectedRun.status]?.toLowerCase()} and is read-only.
                </p>
              ) : (
                <DeliveryRunPersonnelEditor
                  run={selectedRun}
                  deliveryPersonnelState={deliveryPersonnelState}
                  disabled={!canManage}
                  saving={savingKey === 'personnel'}
                  onSave={handleSavePersonnel}
                />
              )}

              {!hasAccountablePersonnel ? (
                <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                  Set an accountable person on this run before adding orders.
                </p>
              ) : null}

              <DeliveryRunMembersList
                run={selectedRun}
                otherRuns={runs}
                disabled={!canManage || selectedRunLocked}
                savingKey={savingKey}
                dispatchResult={dispatchResult}
                onRemoveMember={handleRemoveMember}
                onMoveMember={handleMoveMember}
              />
            </div>
          ) : null}
        </div>
      ) : null}

      <ConfirmActionDialog
        open={dispatchConfirmOpen}
        onOpenChange={setDispatchConfirmOpen}
        title={selectedRunIsDispatched ? 'Re-dispatch this run?' : 'Dispatch this run?'}
        description={`${selectedRunMembers.length} order(s) will be sent out for delivery. This action is not reversible from this screen -- undoing a dispatch means editing each affected order individually.`}
        confirmLabel={selectedRunIsDispatched ? 'Re-dispatch' : 'Dispatch'}
        cancelLabel="Cancel"
        onConfirm={async () => {
          const succeeded = await handleDispatchRun();
          if (succeeded !== false) setDispatchConfirmOpen(false);
          return succeeded;
        }}
      />

      <DeliveryRunFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        run={formRun}
        saving={savingKey === 'form'}
        onSubmit={handleFormSubmit}
      />
    </div>
  );
}
