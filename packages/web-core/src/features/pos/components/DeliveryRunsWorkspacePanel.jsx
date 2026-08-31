import React from 'react';
import { toast } from 'sonner';
import { Plus, RefreshCw, Truck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  addDeliveryRunMembers,
  createDeliveryRun,
  fetchDeliveryRun,
  fetchDeliveryRuns,
  removeDeliveryRunMember,
  setDeliveryRunPersonnel,
  updateDeliveryRun
} from '../services/deliveryRunService.js';
import DeliveryRunFormDialog from './DeliveryRunFormDialog.jsx';
import DeliveryRunPersonnelEditor from './DeliveryRunPersonnelEditor.jsx';
import DeliveryRunMembersList from './DeliveryRunMembersList.jsx';

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

  const loadRuns = React.useCallback(async () => {
    setRunsState((current) => ({ ...current, loading: true, accessState: 'loading' }));
    try {
      const payload = await fetchDeliveryRuns({
        status: statusFilter || undefined,
        location_id: queueLocationScopeId || undefined,
        limit: 100
      });
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
    if (!deliveryRunId) {
      setRunDetailState({ loading: false, run: null, errorMessage: '' });
      return;
    }
    setRunDetailState((current) => ({ ...current, loading: true }));
    try {
      const run = await fetchDeliveryRun(deliveryRunId);
      setRunDetailState({ loading: false, run, errorMessage: '' });
    } catch (error) {
      setRunDetailState({ loading: false, run: null, errorMessage: getErrorMessage(error, 'Failed to load run detail.') });
    }
  }, []);

  React.useEffect(() => {
    loadRunDetail(selectedRunId);
  }, [selectedRunId, loadRunDetail]);

  const selectRun = (deliveryRunId) => {
    setSelectedRunId(deliveryRunId === selectedRunId ? null : deliveryRunId);
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

  const handleSavePersonnel = async (personnel) => {
    const run = runDetailState.run;
    if (!run) return false;
    if (!isOnline) {
      toast.error('Reconnect before saving delivery run personnel.');
      return false;
    }
    setSavingKey('personnel');
    try {
      await setDeliveryRunPersonnel(run.delivery_run_id, {
        idempotency_key: createIdempotencyKey('run-personnel'),
        personnel
      });
      toast.success('Run personnel saved.');
      await refreshAll();
      return true;
    } catch (error) {
      const errorCode = error?.response?.data?.error_code;
      const message = errorCode === 'DELIVERY_RUN_LOCKED'
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
        idempotency_key: createIdempotencyKey('run-move-add'),
        pos_transaction_ids: [posTransactionId]
      });
      toast.success('Order moved to the new run.');
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

  const runs = Array.isArray(runsState.items) ? runsState.items : [];
  const selectedRun = runDetailState.run;
  const selectedRunLocked = selectedRun ? LOCKED_RUN_STATUSES.has(String(selectedRun.status || '').trim()) : false;
  const hasAccountablePersonnel = Array.isArray(selectedRun?.personnel)
    && selectedRun.personnel.some((person) => person?.is_accountable);
  const canManage = canTransactPos && !locked;

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
                <Button type="button" variant="outline" size="sm" onClick={() => openEditForm(selectedRun)} disabled={!canManage || selectedRunLocked}>
                  Edit run
                </Button>
              </div>

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
                onRemoveMember={handleRemoveMember}
                onMoveMember={handleMoveMember}
              />
            </div>
          ) : null}
        </div>
      ) : null}

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
